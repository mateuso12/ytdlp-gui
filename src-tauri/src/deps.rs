//! Runtime dependencies: finds, downloads and verifies yt-dlp, ffmpeg (with
//! ffprobe) and Deno.
//!
//! * yt-dlp is always the app's own copy. It is downloaded as "latest" and
//!   checked against the `SHA2-256SUMS` file published next to it, so it needs
//!   no pinned hash and `--update-to` keeps it current afterwards.
//! * ffmpeg and Deno prefer a copy found on `PATH` ("system"); otherwise the
//!   app downloads a **pinned** build whose SHA-256 is recorded in `deps.json`.
//!   Pinning (instead of "latest") is what makes a hash possible, and it means
//!   a compromised release channel cannot change what the app executes. The
//!   hashes come from the checksum files each project publishes (see the task
//!   report); `deps.json` is embedded in the binary at compile time.
//!
//! The core ([`select_asset`], [`install_asset`], [`detect_tool`], ...) knows
//! nothing about Tauri, so it is tested directly (downloads against a loopback
//! server, archives built in the tests); the `#[tauri::command]`s at the bottom
//! are thin adapters.
//!
//! Safety of installs: every download is streamed to `<name>.part` next to its
//! destination, verified, extracted to another `.part` file, made executable
//! and only then renamed over the final path. A failed or cancelled install
//! therefore never leaves a half-written binary at the final path, and the
//! `.part` files are removed on every error path.

use std::collections::HashMap;
use std::error::Error as StdError;
use std::ffi::OsString;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::process;

/// The pinned download table, embedded at compile time.
const MANIFEST_JSON: &str = include_str!("../deps.json");
const USER_AGENT: &str = concat!("ytdlp-gui/", env!("CARGO_PKG_VERSION"));
/// Progress events are sent at most this often (plus one final event).
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// A download that receives nothing for this long is abandoned.
const READ_TIMEOUT: Duration = Duration::from_secs(30);
/// `--version` of a one-file PyInstaller build can take a while on first run.
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);
const UPDATE_TIMEOUT: Duration = Duration::from_secs(180);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/// The managed dependencies, as named by the frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Which {
    Ytdlp,
    Ffmpeg,
    Deno,
}

impl Which {
    fn label(self) -> &'static str {
        match self {
            Which::Ytdlp => "yt-dlp",
            Which::Ffmpeg => "ffmpeg",
            Which::Deno => "Deno",
        }
    }

    /// Executable name without extension, as looked up on `PATH`.
    fn stem(self) -> &'static str {
        match self {
            Which::Ytdlp => "yt-dlp",
            Which::Ffmpeg => "ffmpeg",
            Which::Deno => "deno",
        }
    }

    fn version_args(self) -> &'static [&'static str] {
        match self {
            Which::Ffmpeg => &["-version"],
            Which::Ytdlp | Which::Deno => &["--version"],
        }
    }
}

/// yt-dlp release channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Nightly,
}

impl Channel {
    fn as_str(self) -> &'static str {
        match self {
            Channel::Stable => "stable",
            Channel::Nightly => "nightly",
        }
    }
}

/// Where a tool was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// Downloaded by this app into its data folder.
    App,
    /// Found on `PATH`.
    System,
}

// ---------------------------------------------------------------------------
// Manifest (deps.json) and asset selection
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct Manifest {
    ytdlp: YtdlpSpec,
    ffmpeg: HashMap<String, Bundle>,
    deno: HashMap<String, Bundle>,
}

#[derive(Debug, Deserialize)]
struct YtdlpSpec {
    /// Release URL prefix; asset and sums names are appended.
    base: String,
    /// Platform key (`windows-x86_64`, `macos-any`, ...) -> release asset name.
    assets: HashMap<String, String>,
    /// Name of the published checksum file.
    sums: String,
}

/// One pinned download: an archive (or bare binary) and what to take from it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Bundle {
    url: String,
    sha256: String,
    archive: ArchiveKind,
    /// The main binary: its path inside the archive (matched by trailing path
    /// components, so the versioned top folder need not be spelled out), or
    /// the output file name for `archive: "none"`.
    bin_path: String,
    /// More files to take from the same archive (ffprobe).
    #[serde(default)]
    also_extract: Vec<String>,
    /// More downloads installed alongside (macOS ships ffprobe separately).
    #[serde(default)]
    extras: Vec<Bundle>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum ArchiveKind {
    #[serde(rename = "zip")]
    Zip,
    #[serde(rename = "tar.xz")]
    TarXz,
    #[serde(rename = "none")]
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ExpectedHash {
    /// Pinned in `deps.json`.
    Known(String),
    /// Looked up by file name in a checksum file downloaded at install time.
    FromSums { url: String, name: String },
}

/// A single download and the files to install from it.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Part {
    url: String,
    hash: ExpectedHash,
    archive: ArchiveKind,
    /// Archive paths to extract (or, for `ArchiveKind::None`, the single
    /// output file name). Each is installed under its last path component.
    entries: Vec<String>,
}

/// Everything to download and install for one dependency on this platform.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Asset {
    parts: Vec<Part>,
}

fn manifest() -> Result<&'static Manifest, String> {
    static MANIFEST: OnceLock<Result<Manifest, String>> = OnceLock::new();
    MANIFEST
        .get_or_init(|| {
            serde_json::from_str(MANIFEST_JSON)
                .map_err(|e| format!("the bundled deps.json is invalid: {e}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// `windows-x86_64`, `linux-aarch64`, ...; `None` for platforms we ship nothing for.
fn platform_key(os: &str, arch: &str) -> Option<String> {
    match (os, arch) {
        ("windows", "x86_64")
        | ("linux", "x86_64" | "aarch64")
        | ("macos", "x86_64" | "aarch64") => Some(format!("{os}-{arch}")),
        _ => None,
    }
}

fn bundle_parts(bundle: &Bundle) -> Vec<Part> {
    let mut entries = vec![bundle.bin_path.clone()];
    if bundle.archive != ArchiveKind::None {
        entries.extend(bundle.also_extract.iter().cloned());
    }
    let mut parts = vec![Part {
        url: bundle.url.clone(),
        hash: ExpectedHash::Known(bundle.sha256.clone()),
        archive: bundle.archive,
        entries,
    }];
    for extra in &bundle.extras {
        parts.extend(bundle_parts(extra));
    }
    parts
}

/// Picks the download for `which` on `os`/`arch` (`std::env::consts` values).
fn select_asset(manifest: &Manifest, which: Which, os: &str, arch: &str) -> Result<Asset, String> {
    let unsupported = || format!("{} is not available for {os}/{arch}", which.label());
    let key = platform_key(os, arch).ok_or_else(unsupported)?;
    let parts = match which {
        Which::Ytdlp => {
            let spec = &manifest.ytdlp;
            let name = spec
                .assets
                .get(&key)
                .or_else(|| spec.assets.get(&format!("{os}-any")))
                .ok_or_else(unsupported)?;
            let out_name = if os == "windows" {
                "yt-dlp.exe"
            } else {
                "yt-dlp"
            };
            vec![Part {
                url: format!("{}{name}", spec.base),
                hash: ExpectedHash::FromSums {
                    url: format!("{}{}", spec.base, spec.sums),
                    name: name.clone(),
                },
                archive: ArchiveKind::None,
                entries: vec![out_name.to_string()],
            }]
        }
        Which::Ffmpeg => bundle_parts(manifest.ffmpeg.get(&key).ok_or_else(unsupported)?),
        Which::Deno => bundle_parts(manifest.deno.get(&key).ok_or_else(unsupported)?),
    };
    Ok(Asset { parts })
}

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

/// Checks the file's SHA-256 against `expected` (hex, case-insensitive).
fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let name = file_name(path);
    let mut file =
        File::open(path).map_err(|e| format!("could not read {name} to verify it: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("could not read {name} to verify it: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err(format!(
            "checksum mismatch for {name}: expected {expected}, got {actual}. \
             The download is corrupt or was tampered with, so it was discarded"
        ))
    }
}

/// Finds `name` in a `sha256sum`-style file (`<hash>  <name>` or `<hash> *<name>`).
fn parse_sums_file(text: &str, name: &str) -> Option<String> {
    for line in text.lines() {
        let Some((hash, rest)) = line.trim().split_once(char::is_whitespace) else {
            continue;
        };
        let rest = rest.trim_start();
        if rest.strip_prefix('*').unwrap_or(rest) == name {
            return Some(hash.to_string());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Archive extraction
// ---------------------------------------------------------------------------

/// Removes the tracked files when dropped; call [`PartFiles::release`] once
/// they have been handed over. Files already renamed away are simply gone.
#[derive(Default)]
struct PartFiles(Vec<PathBuf>);

impl PartFiles {
    fn track(&mut self, path: &Path) {
        self.0.push(path.to_path_buf());
    }

    fn release(&mut self) {
        self.0.clear();
    }
}

impl Drop for PartFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn file_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.display().to_string(),
        |n| n.to_string_lossy().into_owned(),
    )
}

/// Does the archive path `name` denote `wanted`? Compares whole trailing path
/// components, so `bin/ffmpeg` matches `ffmpeg-N-1/bin/ffmpeg` but `deno`
/// does not match `xdeno`. Directories never match.
fn entry_matches(name: &str, wanted: &str) -> bool {
    !name.ends_with('/') && (name == wanted || name.ends_with(&format!("/{wanted}")))
}

fn missing_entry(wanted: &str) -> String {
    format!("{wanted} was not found in the downloaded archive")
}

/// `(<dest>/<file>.part, <dest>/<file>)` for an archive path.
fn entry_targets(dest_dir: &Path, wanted: &str) -> (PathBuf, PathBuf) {
    let file = wanted.rsplit('/').next().unwrap_or(wanted);
    (dest_dir.join(format!("{file}.part")), dest_dir.join(file))
}

fn write_staged(
    reader: &mut impl Read,
    staged: &Path,
    cleanup: &mut PartFiles,
) -> Result<(), String> {
    cleanup.track(staged);
    let mut out =
        File::create(staged).map_err(|e| format!("could not write {}: {e}", file_name(staged)))?;
    io::copy(reader, &mut out)
        .map_err(|e| format!("could not unpack {}: {e}", file_name(staged)))?;
    Ok(())
}

/// Extracts `entries` from `archive` into `dest_dir` as `<name>.part` files.
/// Returns `(staged, final)` path pairs; nothing is created at the final
/// paths. On error no staged file is left behind.
fn extract_archive(
    archive: &Path,
    kind: ArchiveKind,
    entries: &[String],
    dest_dir: &Path,
) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let mut cleanup = PartFiles::default();
    let staged = match kind {
        ArchiveKind::Zip => extract_zip(archive, entries, dest_dir, &mut cleanup)?,
        ArchiveKind::TarXz => extract_tar_xz(archive, entries, dest_dir, &mut cleanup)?,
        ArchiveKind::None => return Err("internal error: not an archive".to_string()),
    };
    cleanup.release();
    Ok(staged)
}

fn extract_zip(
    archive: &Path,
    entries: &[String],
    dest_dir: &Path,
    cleanup: &mut PartFiles,
) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let file =
        File::open(archive).map_err(|e| format!("could not open the downloaded archive: {e}"))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("the downloaded archive is not a valid zip file: {e}"))?;
    let names: Vec<String> = zip
        .file_names()
        .filter_map(|name| name.ok().map(|n| n.into_owned()))
        .collect();
    let mut out = Vec::new();
    for wanted in entries {
        let name = names
            .iter()
            .find(|n| entry_matches(&n.replace('\\', "/"), wanted))
            .ok_or_else(|| missing_entry(wanted))?;
        let mut entry = zip
            .by_name(name)
            .map_err(|e| format!("could not read {wanted} from the downloaded archive: {e}"))?;
        let (staged, fin) = entry_targets(dest_dir, wanted);
        write_staged(&mut entry, &staged, cleanup)?;
        out.push((staged, fin));
    }
    Ok(out)
}

fn extract_tar_xz(
    archive: &Path,
    entries: &[String],
    dest_dir: &Path,
    cleanup: &mut PartFiles,
) -> Result<Vec<(PathBuf, PathBuf)>, String> {
    let file =
        File::open(archive).map_err(|e| format!("could not open the downloaded archive: {e}"))?;
    let mut tar = tar::Archive::new(xz2::read::XzDecoder::new(file));
    let read_err = |e: io::Error| format!("could not read the downloaded archive: {e}");
    let mut remaining: Vec<&String> = entries.iter().collect();
    let mut out = Vec::new();
    for entry in tar.entries().map_err(read_err)? {
        let mut entry = entry.map_err(read_err)?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry
            .path()
            .map_err(read_err)?
            .to_string_lossy()
            .replace('\\', "/");
        let Some(pos) = remaining.iter().position(|w| entry_matches(&path, w)) else {
            continue;
        };
        let wanted = remaining.remove(pos);
        let (staged, fin) = entry_targets(dest_dir, wanted);
        write_staged(&mut entry, &staged, cleanup)?;
        out.push((staged, fin));
        if remaining.is_empty() {
            break;
        }
    }
    match remaining.first() {
        Some(wanted) => Err(missing_entry(wanted)),
        None => Ok(out),
    }
}

// ---------------------------------------------------------------------------
// Download + install
// ---------------------------------------------------------------------------

/// Called with `(bytes received, total if the server said)`.
type ProgressFn<'a> = &'a mut (dyn FnMut(u64, Option<u64>) + Send);

/// Lets an event through at most once per interval.
struct Throttle {
    interval: Duration,
    last: Option<Instant>,
}

impl Throttle {
    fn new(interval: Duration) -> Self {
        Self {
            interval,
            last: None,
        }
    }

    fn ready(&mut self, now: Instant) -> bool {
        match self.last {
            Some(last) if now.duration_since(last) < self.interval => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    // reqwest is built without a bundled TLS provider (see Cargo.toml); this is
    // idempotent, and `Err` only means one is already installed.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .build()
        .map_err(|e| format!("could not set up the download client: {}", describe(&e)))
}

/// `outer: inner: innermost` for an error and its sources.
fn describe(error: &(dyn StdError + 'static)) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(inner) = source {
        text.push_str(": ");
        text.push_str(&inner.to_string());
        source = inner.source();
    }
    text
}

fn host_of(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| url.to_string())
}

async fn get_ok(client: &reqwest::Client, url: &str) -> Result<reqwest::Response, String> {
    let host = host_of(url);
    let response = client.get(url).send().await.map_err(|e| {
        format!(
            "could not download from {host}: {}",
            describe(&e.without_url())
        )
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "could not download from {host}: the server answered HTTP {}",
            status.as_u16()
        ));
    }
    Ok(response)
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    get_ok(client, url).await?.text().await.map_err(|e| {
        format!(
            "could not download from {}: {}",
            host_of(url),
            describe(&e.without_url())
        )
    })
}

/// Streams `url` into `dest`, reporting progress. The caller removes `dest`
/// on error.
async fn download(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    progress: ProgressFn<'_>,
) -> Result<(), String> {
    let mut response = get_ok(client, url).await?;
    let total = response.content_length();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("could not write {}: {e}", file_name(dest)))?;
    let mut received = 0u64;
    let mut throttle = Throttle::new(PROGRESS_INTERVAL);
    loop {
        let chunk = response.chunk().await.map_err(|e| {
            format!(
                "the download from {} was interrupted: {}",
                host_of(url),
                describe(&e.without_url())
            )
        })?;
        let Some(chunk) = chunk else { break };
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("could not write {}: {e}", file_name(dest)))?;
        received += chunk.len() as u64;
        if throttle.ready(Instant::now()) {
            progress(received, total);
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("could not write {}: {e}", file_name(dest)))?;
    drop(file);
    if let Some(total) = total
        && total != received
    {
        return Err(format!(
            "the download from {} ended early ({received} of {total} bytes)",
            host_of(url)
        ));
    }
    progress(received, total);
    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("could not make {} executable: {e}", file_name(path)))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Verifies the downloaded file, unpacks it, makes the binaries executable
/// and renames them over their final paths. Blocking.
fn finish_part(
    part: &Part,
    downloaded: &Path,
    expected: &str,
    bin_dir: &Path,
) -> Result<Vec<PathBuf>, String> {
    verify_sha256(downloaded, expected)?;
    let mut cleanup = PartFiles::default();
    let staged = match part.archive {
        ArchiveKind::None => {
            let name = part
                .entries
                .first()
                .ok_or_else(|| "internal error: no output name".to_string())?;
            vec![(downloaded.to_path_buf(), bin_dir.join(name))]
        }
        kind => {
            let staged = extract_archive(downloaded, kind, &part.entries, bin_dir)?;
            for (path, _) in &staged {
                cleanup.track(path);
            }
            staged
        }
    };
    // Executable *before* the rename: the final path never holds a binary
    // that cannot run.
    for (path, _) in &staged {
        set_executable(path)?;
    }
    let mut installed = Vec::with_capacity(staged.len());
    for (path, fin) in staged {
        std::fs::rename(&path, &fin).map_err(|e| {
            format!(
                "could not replace {}: {e}. If it is running, wait for it to finish and try again",
                file_name(&fin)
            )
        })?;
        installed.push(fin);
    }
    Ok(installed)
}

async fn install_part(
    client: &reqwest::Client,
    part: &Part,
    bin_dir: &Path,
    progress: ProgressFn<'_>,
) -> Result<Vec<PathBuf>, String> {
    let expected = match &part.hash {
        ExpectedHash::Known(hash) => hash.clone(),
        ExpectedHash::FromSums { url, name } => {
            let sums = fetch_text(client, url).await?;
            parse_sums_file(&sums, name)
                .ok_or_else(|| format!("{name} is missing from the published checksums"))?
        }
    };
    let download_name = match (part.archive, part.entries.first()) {
        (ArchiveKind::None, Some(name)) => name.clone(),
        _ => part
            .url
            .rsplit('/')
            .next()
            .unwrap_or("download")
            .to_string(),
    };
    let downloaded = bin_dir.join(format!("{download_name}.part"));
    // Whatever happens (error, cancellation) the download does not stay.
    let mut cleanup = PartFiles::default();
    cleanup.track(&downloaded);

    download(client, &part.url, &downloaded, progress).await?;

    let (part, bin_dir) = (part.clone(), bin_dir.to_path_buf());
    tokio::task::spawn_blocking(move || finish_part(&part, &downloaded, &expected, &bin_dir))
        .await
        .map_err(|e| format!("the installation task failed: {e}"))?
}

/// Downloads, verifies and installs every part of `asset` into `bin_dir`.
/// Returns the installed binaries. Progress is reported per download.
async fn install_asset(
    client: &reqwest::Client,
    asset: &Asset,
    bin_dir: &Path,
    progress: ProgressFn<'_>,
) -> Result<Vec<PathBuf>, String> {
    tokio::fs::create_dir_all(bin_dir)
        .await
        .map_err(|e| format!("could not create {}: {e}", bin_dir.display()))?;
    let mut installed = Vec::new();
    for part in &asset.parts {
        installed.extend(install_part(client, part, bin_dir, &mut *progress).await?);
    }
    Ok(installed)
}

/// Only one install/update per tool at a time (they share `.part` files).
struct InstallGuard(Which);

static BUSY: Mutex<Vec<Which>> = Mutex::new(Vec::new());

impl InstallGuard {
    fn acquire(which: Which) -> Result<Self, String> {
        let mut busy = BUSY.lock().unwrap_or_else(PoisonError::into_inner);
        if busy.contains(&which) {
            return Err(format!(
                "{} is already being installed or updated",
                which.label()
            ));
        }
        busy.push(which);
        Ok(Self(which))
    }
}

impl Drop for InstallGuard {
    fn drop(&mut self) {
        BUSY.lock()
            .unwrap_or_else(PoisonError::into_inner)
            .retain(|w| *w != self.0);
    }
}

// ---------------------------------------------------------------------------
// Locating tools and reading their versions
// ---------------------------------------------------------------------------

/// Existing candidates for `stem`, best first: the one on `search_path`
/// (system), then the app's own copy in `app_dir`.
fn candidates(
    stem: &str,
    search_path: Option<OsString>,
    app_dir: Option<&Path>,
) -> Vec<(PathBuf, Source)> {
    let mut found = Vec::new();
    // `cwd` only matters for relative PATH entries.
    let cwd = std::env::current_dir().unwrap_or_default();
    if let Ok(path) = which::which_in(stem, search_path, cwd) {
        found.push((path, Source::System));
    }
    if let Some(dir) = app_dir {
        let own = dir.join(format!("{stem}{}", std::env::consts::EXE_SUFFIX));
        if own.is_file() {
            found.push((own, Source::App));
        }
    }
    found
}

/// The binary to use for `stem`: a system install wins over the app's copy.
fn locate_tool(
    stem: &str,
    search_path: Option<OsString>,
    app_dir: Option<&Path>,
) -> Option<(PathBuf, Source)> {
    candidates(stem, search_path, app_dir).into_iter().next()
}

/// A usable tool: it exists *and* answered with a version.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Detected {
    path: PathBuf,
    version: String,
    source: Source,
}

/// Like [`locate_tool`], but only returns a candidate that runs and reports a
/// version (a broken system copy falls back to the app's own).
async fn detect_tool(
    which: Which,
    search_path: Option<OsString>,
    app_dir: Option<&Path>,
) -> Option<Detected> {
    for (path, source) in candidates(which.stem(), search_path, app_dir) {
        if let Some(version) = read_version(which, &path).await {
            return Some(Detected {
                path,
                version,
                source,
            });
        }
    }
    None
}

/// The version out of a tool's `--version` output (first non-empty line).
fn parse_version(which: Which, stdout: &str) -> Option<String> {
    let line = stdout.lines().map(str::trim).find(|l| !l.is_empty())?;
    match which {
        Which::Ytdlp => Some(line.to_string()),
        // "ffmpeg version N-127043-g5a54fcf75e Copyright (c) ..."
        Which::Ffmpeg => first_word(line.strip_prefix("ffmpeg version ")?),
        // "deno 2.9.7 (stable, release, x86_64-pc-windows-msvc)"
        Which::Deno => first_word(line.strip_prefix("deno ")?),
    }
}

fn first_word(text: &str) -> Option<String> {
    text.split_whitespace().next().map(str::to_string)
}

/// Runs the tool's version command; `None` if it cannot run or does not
/// look like the expected tool.
async fn read_version(which: Which, bin: &Path) -> Option<String> {
    let args: Vec<String> = which
        .version_args()
        .iter()
        .map(|a| (*a).to_string())
        .collect();
    let output = tokio::time::timeout(PROBE_TIMEOUT, process::capture(bin, &args))
        .await
        .ok()?
        .ok()?;
    if output.code != 0 {
        return None;
    }
    parse_version(which, &output.stdout)
}

fn last_line(text: &str) -> Option<&str> {
    text.lines().rev().map(str::trim).find(|l| !l.is_empty())
}

/// Runs `yt-dlp --update-to <channel>` and returns the version afterwards.
async fn update_ytdlp(bin: &Path, channel: Channel) -> Result<String, String> {
    if !bin.is_file() {
        return Err("yt-dlp is not installed yet. Install it first".to_string());
    }
    let args = vec!["--update-to".to_string(), channel.as_str().to_string()];
    let output = tokio::time::timeout(UPDATE_TIMEOUT, process::capture(bin, &args))
        .await
        .map_err(|_| "updating yt-dlp took too long and was stopped".to_string())?
        .map_err(|e| format!("could not run yt-dlp: {e}"))?;
    if output.code != 0 {
        let reason = last_line(&output.stderr)
            .or_else(|| last_line(&output.stdout))
            .unwrap_or("unknown error");
        return Err(format!("yt-dlp could not update: {reason}"));
    }
    read_version(Which::Ytdlp, bin)
        .await
        .ok_or_else(|| "yt-dlp was updated but does not report its version".to_string())
}

// ---------------------------------------------------------------------------
// Paths used by the rest of the app
// ---------------------------------------------------------------------------

/// `<app data>/bin`, where the app keeps the binaries it downloads.
fn bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("bin"))
        .map_err(|e| format!("could not find the app data folder: {e}"))
}

/// `YTDLP_GUI_BIN` (tests, development) wins; otherwise `<bin_dir>/yt-dlp`.
/// Without a data folder this is the bare name, resolved through `PATH`.
fn resolve_ytdlp_path(override_bin: Option<OsString>, bin_dir: Option<PathBuf>) -> PathBuf {
    match override_bin {
        Some(path) if !path.is_empty() => PathBuf::from(path),
        _ => bin_dir
            .unwrap_or_default()
            .join(format!("yt-dlp{}", std::env::consts::EXE_SUFFIX)),
    }
}

/// Path of the yt-dlp binary (it may not be installed yet).
pub fn ytdlp_path(app: &AppHandle) -> PathBuf {
    resolve_ytdlp_path(std::env::var_os("YTDLP_GUI_BIN"), bin_dir(app).ok())
}

/// The ffmpeg to use (system first, then the app's own copy), if any.
#[allow(dead_code)] // consumed by the job-building tasks that follow
pub fn ffmpeg_path(app: &AppHandle) -> Option<PathBuf> {
    locate_tool(
        "ffmpeg",
        std::env::var_os("PATH"),
        bin_dir(app).ok().as_deref(),
    )
    .map(|(path, _)| path)
}

/// The Deno to use (system first, then the app's own copy), if any.
#[allow(dead_code)] // consumed by the job-building tasks that follow
pub fn deno_path(app: &AppHandle) -> Option<PathBuf> {
    locate_tool(
        "deno",
        std::env::var_os("PATH"),
        bin_dir(app).ok().as_deref(),
    )
    .map(|(path, _)| path)
}

// ---------------------------------------------------------------------------
// Tauri adapter
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct YtdlpStatus {
    path: String,
    version: String,
}

#[derive(Debug, Serialize)]
pub struct ToolStatus {
    path: String,
    version: String,
    source: Source,
}

impl From<Detected> for ToolStatus {
    fn from(found: Detected) -> Self {
        Self {
            path: found.path.to_string_lossy().into_owned(),
            version: found.version,
            source: found.source,
        }
    }
}

/// What is installed. A missing (or broken) tool is `null`.
#[derive(Debug, Serialize)]
pub struct DepsStatus {
    ytdlp: Option<YtdlpStatus>,
    ffmpeg: Option<ToolStatus>,
    deno: Option<ToolStatus>,
}

/// `deps://progress` payload. `total` is `null` when the server did not say.
#[derive(Clone, Serialize)]
struct ProgressPayload {
    which: Which,
    received: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn deps_status(app: AppHandle) -> Result<DepsStatus, String> {
    let app_dir = bin_dir(&app).ok();
    let search_path = std::env::var_os("PATH");
    let ytdlp_bin = ytdlp_path(&app);
    let (ytdlp, ffmpeg, deno) = tokio::join!(
        read_version(Which::Ytdlp, &ytdlp_bin),
        detect_tool(Which::Ffmpeg, search_path.clone(), app_dir.as_deref()),
        detect_tool(Which::Deno, search_path, app_dir.as_deref()),
    );
    Ok(DepsStatus {
        ytdlp: ytdlp.map(|version| YtdlpStatus {
            path: ytdlp_bin.to_string_lossy().into_owned(),
            version,
        }),
        ffmpeg: ffmpeg.map(ToolStatus::from),
        deno: deno.map(ToolStatus::from),
    })
}

/// Downloads `which` into the app's bin folder, emitting `deps://progress`
/// (about ten times a second at most) while it does.
#[tauri::command]
pub async fn deps_install(app: AppHandle, which: Which) -> Result<(), String> {
    let _guard = InstallGuard::acquire(which)?;
    let asset = select_asset(
        manifest()?,
        which,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )?;
    let dir = bin_dir(&app)?;
    let client = http_client()?;
    let mut progress = move |received, total| {
        let _ = app.emit(
            "deps://progress",
            ProgressPayload {
                which,
                received,
                total,
            },
        );
    };
    install_asset(&client, &asset, &dir, &mut progress)
        .await
        .map(|_| ())
}

/// Runs `yt-dlp --update-to <channel>`; resolves to the new version.
#[tauri::command]
pub async fn deps_update_ytdlp(app: AppHandle, channel: Channel) -> Result<String, String> {
    let _guard = InstallGuard::acquire(Which::Ytdlp)?;
    update_ytdlp(&ytdlp_path(&app), channel).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;

    fn hex(bytes: &[u8]) -> String {
        Sha256::digest(bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    fn manifest() -> Manifest {
        serde_json::from_str(MANIFEST_JSON).expect("deps.json must parse")
    }

    // ---- checksums -------------------------------------------------------

    #[test]
    fn verify_sha256_ok() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.bin");
        std::fs::write(&file, b"hello world").unwrap();
        // sha256("hello world"), upper case on purpose: comparison ignores case.
        let known = "B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9";
        assert_eq!(verify_sha256(&file, known), Ok(()));
        assert_eq!(verify_sha256(&file, &known.to_lowercase()), Ok(()));
    }

    #[test]
    fn verify_sha256_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.bin");
        std::fs::write(&file, b"hello world").unwrap();
        let err = verify_sha256(&file, &"0".repeat(64)).unwrap_err();
        assert!(err.contains("checksum"), "{err}");
        let err = verify_sha256(&dir.path().join("missing"), &"0".repeat(64)).unwrap_err();
        assert!(err.contains("could not read"), "{err}");
    }

    #[test]
    fn parse_sums_file_finds_hash() {
        let text = "aaa111  yt-dlp_linux\r\n\
                    bbb222  yt-dlp.exe\n\
                    ccc333 *yt-dlp_macos\n\
                    \n\
                    ddd444  yt-dlp_linux_aarch64\n";
        assert_eq!(
            parse_sums_file(text, "yt-dlp.exe").as_deref(),
            Some("bbb222")
        );
        assert_eq!(
            parse_sums_file(text, "yt-dlp_linux").as_deref(),
            Some("aaa111")
        );
        // Binary-mode marker is tolerated.
        assert_eq!(
            parse_sums_file(text, "yt-dlp_macos").as_deref(),
            Some("ccc333")
        );
        // Exact name only: "yt-dlp" is a prefix of every entry, not an entry.
        assert_eq!(parse_sums_file(text, "yt-dlp"), None);
        assert_eq!(parse_sums_file("", "yt-dlp.exe"), None);
    }

    // ---- manifest + asset selection -------------------------------------

    const PLATFORMS: [(&str, &str); 5] = [
        ("windows", "x86_64"),
        ("linux", "x86_64"),
        ("linux", "aarch64"),
        ("macos", "x86_64"),
        ("macos", "aarch64"),
    ];

    #[test]
    fn manifest_is_well_formed() {
        let m = manifest();
        let all: Vec<&Bundle> = m
            .ffmpeg
            .values()
            .chain(m.deno.values())
            .flat_map(|b| std::iter::once(b).chain(b.extras.iter()))
            .collect();
        for bundle in all {
            assert!(bundle.url.starts_with("https://"), "{}", bundle.url);
            assert_eq!(bundle.sha256.len(), 64, "{}", bundle.url);
            assert!(
                bundle.sha256.bytes().all(|b| b.is_ascii_hexdigit()),
                "{}",
                bundle.url
            );
            assert!(!bundle.bin_path.is_empty());
        }
        assert!(m.ytdlp.base.starts_with("https://") && m.ytdlp.base.ends_with('/'));
        for (os, arch) in PLATFORMS {
            let key = platform_key(os, arch).unwrap();
            assert!(m.ffmpeg.contains_key(&key), "ffmpeg {key}");
            assert!(m.deno.contains_key(&key), "deno {key}");
        }
    }

    fn only_part(asset: &Asset) -> &Part {
        assert_eq!(asset.parts.len(), 1);
        &asset.parts[0]
    }

    #[test]
    fn select_asset_ytdlp_per_platform() {
        let m = manifest();
        let cases = [
            ("windows", "x86_64", "yt-dlp.exe", "yt-dlp.exe"),
            ("linux", "x86_64", "yt-dlp_linux", "yt-dlp"),
            ("linux", "aarch64", "yt-dlp_linux_aarch64", "yt-dlp"),
            ("macos", "x86_64", "yt-dlp_macos", "yt-dlp"),
            // One universal build serves both Mac architectures.
            ("macos", "aarch64", "yt-dlp_macos", "yt-dlp"),
        ];
        for (os, arch, asset_name, out_name) in cases {
            let asset = select_asset(&m, Which::Ytdlp, os, arch).unwrap();
            let part = only_part(&asset);
            assert_eq!(
                part.url,
                format!("{}{asset_name}", m.ytdlp.base),
                "{os}/{arch}"
            );
            assert_eq!(part.archive, ArchiveKind::None);
            assert_eq!(part.entries, [out_name]);
            assert_eq!(
                part.hash,
                ExpectedHash::FromSums {
                    url: format!("{}SHA2-256SUMS", m.ytdlp.base),
                    name: asset_name.to_string()
                }
            );
        }
    }

    #[test]
    fn select_asset_ffmpeg_per_platform() {
        let m = manifest();
        let cases = [
            (
                "windows",
                "x86_64",
                "win64-gpl.zip",
                ArchiveKind::Zip,
                "ffmpeg.exe",
            ),
            (
                "linux",
                "x86_64",
                "linux64-gpl.tar.xz",
                ArchiveKind::TarXz,
                "ffmpeg",
            ),
            (
                "linux",
                "aarch64",
                "linuxarm64-gpl.tar.xz",
                ArchiveKind::TarXz,
                "ffmpeg",
            ),
            (
                "macos",
                "x86_64",
                "/macos/amd64/",
                ArchiveKind::Zip,
                "ffmpeg",
            ),
            (
                "macos",
                "aarch64",
                "/macos/arm64/",
                ArchiveKind::Zip,
                "ffmpeg",
            ),
        ];
        for (os, arch, url_part, archive, binary) in cases {
            let asset = select_asset(&m, Which::Ffmpeg, os, arch).unwrap();
            let first = &asset.parts[0];
            assert!(first.url.contains(url_part), "{os}/{arch}: {}", first.url);
            assert_eq!(first.archive, archive, "{os}/{arch}");
            assert_eq!(first.entries[0].rsplit('/').next().unwrap(), binary);
            assert!(matches!(first.hash, ExpectedHash::Known(_)));
        }
        // ffprobe (needed by yt-dlp for -x and embedding) ships with ffmpeg:
        // inside the same archive on Windows/Linux, as a second download on macOS.
        let win = select_asset(&m, Which::Ffmpeg, "windows", "x86_64").unwrap();
        assert_eq!(win.parts.len(), 1);
        assert_eq!(win.parts[0].entries, ["bin/ffmpeg.exe", "bin/ffprobe.exe"]);
        let mac = select_asset(&m, Which::Ffmpeg, "macos", "aarch64").unwrap();
        assert_eq!(mac.parts.len(), 2);
        assert_eq!(mac.parts[1].entries, ["ffprobe"]);
    }

    #[test]
    fn select_asset_deno_per_platform() {
        let m = manifest();
        let cases = [
            (
                "windows",
                "x86_64",
                "deno-x86_64-pc-windows-msvc.zip",
                "deno.exe",
            ),
            (
                "linux",
                "x86_64",
                "deno-x86_64-unknown-linux-gnu.zip",
                "deno",
            ),
            (
                "linux",
                "aarch64",
                "deno-aarch64-unknown-linux-gnu.zip",
                "deno",
            ),
            ("macos", "x86_64", "deno-x86_64-apple-darwin.zip", "deno"),
            ("macos", "aarch64", "deno-aarch64-apple-darwin.zip", "deno"),
        ];
        for (os, arch, zip, binary) in cases {
            let asset = select_asset(&m, Which::Deno, os, arch).unwrap();
            let part = only_part(&asset);
            assert!(
                part.url
                    .starts_with("https://github.com/denoland/deno/releases/download/v")
                    && part.url.ends_with(zip),
                "{os}/{arch}: {}",
                part.url
            );
            assert_eq!(part.archive, ArchiveKind::Zip);
            assert_eq!(part.entries, [binary]);
            assert!(matches!(part.hash, ExpectedHash::Known(_)));
        }
    }

    #[test]
    fn select_asset_unknown_platform_is_err() {
        let m = manifest();
        for which in [Which::Ytdlp, Which::Ffmpeg, Which::Deno] {
            for (os, arch) in [
                ("freebsd", "x86_64"),
                ("linux", "riscv64"),
                ("windows", "aarch64"),
                ("windows", "x86"),
            ] {
                let err = select_asset(&m, which, os, arch).unwrap_err();
                assert!(err.contains(os) && err.contains(arch), "{err}");
            }
        }
    }

    #[test]
    fn ytdlp_path_prefers_override_then_app_bin() {
        let dir = PathBuf::from("data").join("bin");
        let exe = format!("yt-dlp{}", std::env::consts::EXE_SUFFIX);
        assert_eq!(resolve_ytdlp_path(None, Some(dir.clone())), dir.join(&exe));
        assert_eq!(
            resolve_ytdlp_path(Some("".into()), Some(dir.clone())),
            dir.join(&exe)
        );
        assert_eq!(
            resolve_ytdlp_path(Some("/opt/custom/yt-dlp".into()), Some(dir)),
            PathBuf::from("/opt/custom/yt-dlp")
        );
        // No data folder: fall back to the bare name (found through PATH).
        assert_eq!(resolve_ytdlp_path(None, None), PathBuf::from(exe));
    }

    // ---- version parsing -------------------------------------------------

    #[test]
    fn parse_version_per_tool() {
        assert_eq!(
            parse_version(Which::Ytdlp, "\n2026.10.14\n").as_deref(),
            Some("2026.10.14")
        );
        assert_eq!(parse_version(Which::Ytdlp, "  \n"), None);
        assert_eq!(
            parse_version(
                Which::Ffmpeg,
                "ffmpeg version N-127043-g5a54fcf75e-20260930 Copyright (c) 2000-2026\nbuilt with gcc"
            )
            .as_deref(),
            Some("N-127043-g5a54fcf75e-20260930")
        );
        assert_eq!(
            parse_version(Which::Ffmpeg, "ffmpeg version 7.1.1 Copyright").as_deref(),
            Some("7.1.1")
        );
        assert_eq!(parse_version(Which::Ffmpeg, "not ffmpeg at all"), None);
        assert_eq!(
            parse_version(
                Which::Deno,
                "deno 2.9.7 (stable, release, x86_64-pc-windows-msvc)\nv8 14.0"
            )
            .as_deref(),
            Some("2.9.7")
        );
        assert_eq!(parse_version(Which::Deno, "something else"), None);
    }

    // ---- locating system vs app binaries ---------------------------------

    /// Creates an executable `name` in `dir` and returns its path.
    fn fake_bin(dir: &Path, name: &str, script_body: &str) -> PathBuf {
        let file = dir.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
        std::fs::write(&file, format!("#!/bin/sh\n{script_body}\n")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        file
    }

    #[test]
    fn prefers_system_ffmpeg() {
        let system = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let sys_ffmpeg = fake_bin(system.path(), "ffmpeg", "echo ffmpeg version 1");
        let app_ffmpeg = fake_bin(app.path(), "ffmpeg", "echo ffmpeg version 2");
        let path = Some(system.path().as_os_str().to_owned());

        let (found, source) = locate_tool("ffmpeg", path.clone(), Some(app.path())).unwrap();
        assert_eq!(source, Source::System);
        assert_eq!(found, sys_ffmpeg);

        // Not on PATH: the app's own copy is used.
        let (found, source) = locate_tool("ffmpeg", None, Some(app.path())).unwrap();
        assert_eq!(source, Source::App);
        assert_eq!(found, app_ffmpeg);

        assert!(locate_tool("ffmpeg", None, None).is_none());
        assert!(locate_tool("ffmpeg", path, None).is_some());
    }

    #[test]
    fn prefers_system_deno() {
        let system = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let sys_deno = fake_bin(system.path(), "deno", "echo deno 1");
        fake_bin(app.path(), "deno", "echo deno 2");
        let path = Some(system.path().as_os_str().to_owned());

        let (found, source) = locate_tool("deno", path, Some(app.path())).unwrap();
        assert_eq!(source, Source::System);
        assert_eq!(found, sys_deno);
        assert_eq!(
            locate_tool("deno", None, Some(app.path())).unwrap().1,
            Source::App
        );
        let empty = tempfile::tempdir().unwrap();
        assert!(locate_tool("deno", None, Some(empty.path())).is_none());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn detect_tool_reports_version_and_skips_broken_system_copy() {
        let system = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let path = Some(system.path().as_os_str().to_owned());
        fake_bin(app.path(), "ffmpeg", "echo 'ffmpeg version 7.1 Copyright'");

        // System copy that is not really ffmpeg: fall back to the app copy.
        fake_bin(system.path(), "ffmpeg", "echo nope");
        let found = detect_tool(Which::Ffmpeg, path.clone(), Some(app.path()))
            .await
            .unwrap();
        assert_eq!(found.source, Source::App);
        assert_eq!(found.version, "7.1");

        fake_bin(
            system.path(),
            "ffmpeg",
            "echo 'ffmpeg version 8.0 Copyright'",
        );
        let found = detect_tool(Which::Ffmpeg, path, Some(app.path()))
            .await
            .unwrap();
        assert_eq!(found.source, Source::System);
        assert_eq!(found.version, "8.0");

        assert!(
            detect_tool(Which::Deno, None, Some(app.path()))
                .await
                .is_none()
        );
    }

    // ---- archive extraction ----------------------------------------------

    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, data) in entries {
            if name.ends_with('/') {
                zip.add_directory(*name, options).unwrap();
            } else {
                zip.start_file(*name, options).unwrap();
                zip.write_all(data).unwrap();
            }
        }
        zip.finish().unwrap();
    }

    fn make_tar_xz(path: &Path, entries: &[(&str, &[u8])]) {
        let encoder = xz2::write::XzEncoder::new(std::fs::File::create(path).unwrap(), 1);
        let mut tar = tar::Builder::new(encoder);
        for (name, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_entry_type(tar::EntryType::Regular);
            tar.append_data(&mut header, name, *data).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
    }

    fn staged_names(extracted: &[(PathBuf, PathBuf)]) -> Vec<String> {
        extracted
            .iter()
            .map(|(_, fin)| fin.file_name().unwrap().to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn extract_zip_picks_entries_by_suffix() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("a.zip");
        make_zip(
            &archive,
            &[
                ("ffmpeg-N-1-win64-gpl/", b""),
                ("ffmpeg-N-1-win64-gpl/bin/ffmpeg.exe", b"FFMPEG"),
                ("ffmpeg-N-1-win64-gpl/bin/ffprobe.exe", b"FFPROBE"),
                ("ffmpeg-N-1-win64-gpl/doc/ffmpeg.exe.txt", b"docs"),
            ],
        );
        let out = dir.path().join("out");
        std::fs::create_dir(&out).unwrap();
        let wanted = ["bin/ffmpeg.exe".to_string(), "bin/ffprobe.exe".to_string()];
        let extracted = extract_archive(&archive, ArchiveKind::Zip, &wanted, &out).unwrap();

        assert_eq!(staged_names(&extracted), ["ffmpeg.exe", "ffprobe.exe"]);
        assert_eq!(std::fs::read(&extracted[0].0).unwrap(), b"FFMPEG");
        assert_eq!(std::fs::read(&extracted[1].0).unwrap(), b"FFPROBE");
        // Staged next to the destination as `<name>.part`; nothing at the final path.
        assert_eq!(extracted[0].0, out.join("ffmpeg.exe.part"));
        assert!(!out.join("ffmpeg.exe").exists());
    }

    #[test]
    fn extract_zip_root_entry_and_missing_entry() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("deno.zip");
        make_zip(&archive, &[("deno", b"DENO")]);
        let out = dir.path().join("out");
        std::fs::create_dir(&out).unwrap();

        let extracted =
            extract_archive(&archive, ArchiveKind::Zip, &["deno".to_string()], &out).unwrap();
        assert_eq!(std::fs::read(&extracted[0].0).unwrap(), b"DENO");

        // "xdeno" must not match the entry "deno" (suffix match is per path component).
        let err =
            extract_archive(&archive, ArchiveKind::Zip, &["xdeno".to_string()], &out).unwrap_err();
        assert!(err.contains("xdeno"), "{err}");
        let err = extract_archive(&archive, ArchiveKind::Zip, &["bin/deno".to_string()], &out)
            .unwrap_err();
        assert!(err.contains("bin/deno"), "{err}");
    }

    #[test]
    fn extract_tar_xz_picks_entries_and_cleans_up_on_missing() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("a.tar.xz");
        make_tar_xz(
            &archive,
            &[
                ("ffmpeg-N-1-linux64-gpl/bin/ffmpeg", b"FFMPEG"),
                ("ffmpeg-N-1-linux64-gpl/bin/ffprobe", b"FFPROBE"),
                ("ffmpeg-N-1-linux64-gpl/LICENSE.txt", b"license"),
            ],
        );
        let out = dir.path().join("out");
        std::fs::create_dir(&out).unwrap();

        let wanted = ["bin/ffmpeg".to_string(), "bin/ffprobe".to_string()];
        let extracted = extract_archive(&archive, ArchiveKind::TarXz, &wanted, &out).unwrap();
        assert_eq!(staged_names(&extracted), ["ffmpeg", "ffprobe"]);
        assert_eq!(std::fs::read(&extracted[1].0).unwrap(), b"FFPROBE");

        // One entry missing: the error names it and no `.part` file is left behind.
        for (staged, _) in &extracted {
            std::fs::remove_file(staged).unwrap();
        }
        let wanted = ["bin/ffmpeg".to_string(), "bin/nope".to_string()];
        let err = extract_archive(&archive, ArchiveKind::TarXz, &wanted, &out).unwrap_err();
        assert!(err.contains("bin/nope"), "{err}");
        assert_eq!(std::fs::read_dir(&out).unwrap().count(), 0);
    }

    #[test]
    fn extract_corrupt_archive_is_err() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("bad");
        std::fs::write(&archive, b"this is not an archive").unwrap();
        for kind in [ArchiveKind::Zip, ArchiveKind::TarXz] {
            let err = extract_archive(&archive, kind, &["x".to_string()], dir.path()).unwrap_err();
            assert!(err.contains("archive"), "{err}");
        }
    }

    // ---- download + install (local HTTP server, no internet) ---------------

    type Route = (&'static str, u16, Vec<u8>);

    /// Serves `routes` on a loopback port and returns the base URL.
    fn serve(routes: Vec<Route>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let routes = Arc::new(routes);
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let routes = routes.clone();
                thread::spawn(move || {
                    let mut request = Vec::new();
                    let mut byte = [0u8; 1];
                    while !request.ends_with(b"\r\n\r\n") {
                        match stream.read(&mut byte) {
                            Ok(1) => request.push(byte[0]),
                            _ => return,
                        }
                    }
                    let request = String::from_utf8_lossy(&request).into_owned();
                    let path = request.split_whitespace().nth(1).unwrap_or("/").to_string();
                    let (status, body) = routes
                        .iter()
                        .find(|(p, _, _)| *p == path)
                        .map_or((404, Vec::new()), |(_, s, b)| (*s, b.clone()));
                    let head = format!(
                        "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(&body);
                });
            }
        });
        base
    }

    fn client() -> reqwest::Client {
        http_client().expect("client")
    }

    fn files_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.zip");
        make_zip(&path, entries);
        std::fs::read(path).unwrap()
    }

    fn known_zip_part(url: String, bytes: &[u8], entries: &[&str]) -> Part {
        Part {
            url,
            hash: ExpectedHash::Known(hex(bytes)),
            archive: ArchiveKind::Zip,
            entries: entries.iter().map(|e| e.to_string()).collect(),
        }
    }

    type Events = Arc<Mutex<Vec<(u64, Option<u64>)>>>;

    #[tokio::test]
    async fn install_zip_extracts_verifies_and_leaves_no_part_files() {
        let archive = zip_bytes(&[
            ("pkg/bin/ffmpeg", &vec![b'F'; 200_000]),
            ("pkg/bin/ffprobe", b"PROBE"),
        ]);
        let base = serve(vec![("/ff.zip", 200, archive.clone())]);
        let dest = tempfile::tempdir().unwrap();
        let bin = dest.path().join("bin"); // does not exist yet
        let asset = Asset {
            parts: vec![known_zip_part(
                format!("{base}/ff.zip"),
                &archive,
                &["bin/ffmpeg", "bin/ffprobe"],
            )],
        };

        let events: Events = Arc::default();
        let sink = events.clone();
        let mut progress = move |received, total| sink.lock().unwrap().push((received, total));
        let installed = install_asset(&client(), &asset, &bin, &mut progress)
            .await
            .unwrap();

        assert_eq!(installed, [bin.join("ffmpeg"), bin.join("ffprobe")]);
        assert_eq!(files_in(&bin), ["ffmpeg", "ffprobe"]);
        assert_eq!(std::fs::read(bin.join("ffprobe")).unwrap(), b"PROBE");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(bin.join("ffmpeg"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o755);
        }
        let events = events.lock().unwrap();
        let last = events.last().expect("progress events");
        assert_eq!(*last, (archive.len() as u64, Some(archive.len() as u64)));
        assert!(events.windows(2).all(|w| w[0].0 <= w[1].0), "monotonic");
    }

    #[tokio::test]
    async fn install_checksum_mismatch_keeps_the_old_binary_and_cleans_up() {
        let archive = zip_bytes(&[("deno", b"NEW")]);
        let base = serve(vec![("/deno.zip", 200, archive.clone())]);
        let dest = tempfile::tempdir().unwrap();
        std::fs::write(dest.path().join("deno"), b"OLD").unwrap();
        let mut part = known_zip_part(format!("{base}/deno.zip"), &archive, &["deno"]);
        part.hash = ExpectedHash::Known("0".repeat(64));
        let asset = Asset { parts: vec![part] };

        let err = install_asset(&client(), &asset, dest.path(), &mut |_, _| {})
            .await
            .unwrap_err();
        assert!(err.contains("checksum"), "{err}");
        assert_eq!(
            files_in(dest.path()),
            ["deno"],
            "only the old binary remains"
        );
        assert_eq!(std::fs::read(dest.path().join("deno")).unwrap(), b"OLD");
    }

    #[tokio::test]
    async fn install_http_error_and_unreachable_host_leave_nothing() {
        let base = serve(vec![]);
        let dest = tempfile::tempdir().unwrap();
        let part = known_zip_part(format!("{base}/missing.zip"), b"", &["deno"]);
        let err = install_asset(
            &client(),
            &Asset { parts: vec![part] },
            dest.path(),
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert!(err.contains("404"), "{err}");
        assert!(files_in(dest.path()).is_empty());

        // Nothing listens on this port any more.
        let closed = {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            format!("http://{}", l.local_addr().unwrap())
        };
        let part = known_zip_part(format!("{closed}/x.zip"), b"", &["deno"]);
        let err = install_asset(
            &client(),
            &Asset { parts: vec![part] },
            dest.path(),
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert!(err.contains("download"), "{err}");
        assert!(files_in(dest.path()).is_empty());
    }

    #[tokio::test]
    async fn install_ytdlp_style_uses_published_sums() {
        let binary = b"#!/bin/sh\necho 2026.10.14\n".to_vec();
        let sums = format!(
            "{}  yt-dlp_linux\n{}  other\n",
            hex(&binary),
            "1".repeat(64)
        );
        let base = serve(vec![
            ("/yt-dlp_linux", 200, binary.clone()),
            ("/SHA2-256SUMS", 200, sums.into_bytes()),
        ]);
        let dest = tempfile::tempdir().unwrap();
        let part = Part {
            url: format!("{base}/yt-dlp_linux"),
            hash: ExpectedHash::FromSums {
                url: format!("{base}/SHA2-256SUMS"),
                name: "yt-dlp_linux".into(),
            },
            archive: ArchiveKind::None,
            entries: vec!["yt-dlp".into()],
        };
        let asset = Asset {
            parts: vec![part.clone()],
        };

        install_asset(&client(), &asset, dest.path(), &mut |_, _| {})
            .await
            .unwrap();
        assert_eq!(files_in(dest.path()), ["yt-dlp"]);
        assert_eq!(std::fs::read(dest.path().join("yt-dlp")).unwrap(), binary);

        // The name is not in the sums: refuse, and keep what is installed.
        let mut missing = part;
        missing.hash = ExpectedHash::FromSums {
            url: format!("{base}/SHA2-256SUMS"),
            name: "yt-dlp_macos".into(),
        };
        let err = install_asset(
            &client(),
            &Asset {
                parts: vec![missing],
            },
            dest.path(),
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert!(err.contains("yt-dlp_macos"), "{err}");
        assert_eq!(files_in(dest.path()), ["yt-dlp"]);
    }

    // ---- progress throttle + install guard ---------------------------------

    #[test]
    fn throttle_limits_event_rate() {
        let start = Instant::now();
        let mut throttle = Throttle::new(Duration::from_millis(100));
        assert!(throttle.ready(start), "first event passes");
        assert!(!throttle.ready(start + Duration::from_millis(10)));
        assert!(!throttle.ready(start + Duration::from_millis(99)));
        assert!(throttle.ready(start + Duration::from_millis(100)));
        assert!(!throttle.ready(start + Duration::from_millis(150)));
        assert!(throttle.ready(start + Duration::from_millis(250)));
    }

    #[test]
    fn install_guard_is_exclusive_per_tool() {
        let first = InstallGuard::acquire(Which::Deno).unwrap();
        assert!(InstallGuard::acquire(Which::Deno).is_err());
        // Other tools are independent.
        drop(InstallGuard::acquire(Which::Ffmpeg).unwrap());
        drop(first);
        assert!(InstallGuard::acquire(Which::Deno).is_ok());
    }

    // ---- update ---------------------------------------------------------------

    #[cfg(unix)]
    #[tokio::test]
    async fn update_ytdlp_runs_update_to_and_returns_new_version() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("args.log");
        let script = format!(
            "if [ \"$1\" = \"--update-to\" ]; then echo \"$2\" > '{}'; exit 0; fi\n\
             echo 2026.10.15",
            log.display()
        );
        let bin = fake_bin(dir.path(), "yt-dlp", &script);

        let version = update_ytdlp(&bin, Channel::Nightly).await.unwrap();
        assert_eq!(version, "2026.10.15");
        assert_eq!(std::fs::read_to_string(&log).unwrap().trim(), "nightly");
        update_ytdlp(&bin, Channel::Stable).await.unwrap();
        assert_eq!(std::fs::read_to_string(&log).unwrap().trim(), "stable");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn update_ytdlp_failure_and_missing_binary_are_readable_errors() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_bin(
            dir.path(),
            "yt-dlp",
            "echo 'ERROR: Unable to reach github.com' >&2; exit 1",
        );
        let err = update_ytdlp(&bin, Channel::Stable).await.unwrap_err();
        assert!(err.contains("Unable to reach github.com"), "{err}");

        let err = update_ytdlp(&dir.path().join("nope"), Channel::Stable)
            .await
            .unwrap_err();
        assert!(err.contains("not installed"), "{err}");
    }

    // ---- live smoke tests (network; run with `cargo test -- --ignored live`) ----

    async fn live_install(which: Which) -> (tempfile::TempDir, Vec<PathBuf>) {
        let asset = select_asset(
            &manifest(),
            which,
            std::env::consts::OS,
            std::env::consts::ARCH,
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let installed = install_asset(&client(), &asset, dir.path(), &mut |_, _| {})
            .await
            .unwrap();
        (dir, installed)
    }

    #[tokio::test]
    #[ignore = "downloads ~40 MB from github.com"]
    async fn live_install_deno_runs() {
        let (_dir, installed) = live_install(Which::Deno).await;
        let version = read_version(Which::Deno, &installed[0]).await.unwrap();
        assert!(!version.is_empty());
    }

    #[tokio::test]
    #[ignore = "downloads ~35 MB from github.com"]
    async fn live_install_ytdlp_runs() {
        let (_dir, installed) = live_install(Which::Ytdlp).await;
        let version = read_version(Which::Ytdlp, &installed[0]).await.unwrap();
        assert!(!version.is_empty());
    }

    #[tokio::test]
    #[ignore = "downloads ~100 MB from github.com"]
    async fn live_install_ffmpeg_runs() {
        let (dir, installed) = live_install(Which::Ffmpeg).await;
        assert_eq!(installed.len(), 2, "ffmpeg and ffprobe");
        assert!(read_version(Which::Ffmpeg, &installed[0]).await.is_some());
        assert!(
            dir.path()
                .join(format!("ffprobe{}", std::env::consts::EXE_SUFFIX))
                .is_file()
        );
    }
}
