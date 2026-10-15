//! Spawns yt-dlp, streams its output lines and kills whole process trees.
//!
//! The core ([`JobRegistry`], [`capture`]) knows nothing about Tauri, so it can
//! be tested directly; the `#[tauri::command]`s at the bottom are thin adapters
//! that turn lines and exits into `job://line` / `job://exit` events.
//!
//! Every job runs in its own process group (Unix) or Job Object (Windows) via
//! `command-group`, so cancelling kills yt-dlp *and* the ffmpeg it started.

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use command_group::{AsyncCommandGroup, AsyncGroupChild};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::task::JoinHandle;

/// How often a job's supervisor checks whether the process has exited.
const EXIT_POLL: Duration = Duration::from_millis(50);
/// After the process exits, how long its pipes may stay open (held by an
/// escaped grandchild) before the remaining output is abandoned.
const DRAIN_GRACE: Duration = Duration::from_secs(2);
/// `kill_all` runs on the exit path: reap the killed jobs, but never block long.
const KILL_ALL_REAP: Duration = Duration::from_millis(500);

/// Windows: do not flash a console window for the child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Which pipe a line came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stream {
    Stdout,
    Stderr,
}

/// Receives every output line of a job (without the trailing newline).
pub type LineSink = Arc<dyn Fn(Stream, String) + Send + Sync>;

/// Output of a process that ran to completion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Capture {
    /// Exit code; `-1` when the process ended without one (killed by a signal).
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

struct Job {
    /// Distinguishes this run from a later job that reuses the same id.
    token: u64,
    child: AsyncGroupChild,
    cancelled: bool,
}

/// Running jobs, keyed by job id. Cheap to clone (shared state).
///
/// The lock is a std `Mutex` and is never held across an `.await`.
#[derive(Clone, Default)]
pub struct JobRegistry {
    jobs: Arc<Mutex<HashMap<String, Job>>>,
    next_token: Arc<AtomicU64>,
}

impl JobRegistry {
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Job>> {
        self.jobs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Starts `program` as a new job and streams its lines to `on_line`.
    ///
    /// Returns once the process is running; the handle resolves to the exit
    /// code after every line has been delivered (`None` if the job was
    /// cancelled or killed). Fails, registering nothing, if the id is already
    /// running or the process cannot be started. Must run inside Tokio.
    pub fn spawn(
        &self,
        job_id: String,
        program: &Path,
        args: &[String],
        on_line: LineSink,
    ) -> io::Result<JoinHandle<Option<i32>>> {
        let runtime = tokio::runtime::Handle::try_current().map_err(io::Error::other)?;
        let (token, stdout, stderr) = {
            let mut jobs = self.lock();
            if jobs.contains_key(&job_id) {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    format!("job {job_id} is already running"),
                ));
            }
            let mut child = spawn_group(program, args)?;
            let stdout = child.inner().stdout.take();
            let stderr = child.inner().stderr.take();
            let token = self.next_token.fetch_add(1, Ordering::Relaxed);
            let job = Job {
                token,
                child,
                cancelled: false,
            };
            jobs.insert(job_id.clone(), job);
            (token, stdout, stderr)
        };

        let mut readers = Vec::with_capacity(2);
        if let Some(pipe) = stdout {
            readers.push(runtime.spawn(pump(pipe, Stream::Stdout, on_line.clone())));
        }
        if let Some(pipe) = stderr {
            readers.push(runtime.spawn(pump(pipe, Stream::Stderr, on_line)));
        }
        let registry = self.clone();
        Ok(runtime.spawn(async move { registry.supervise(job_id, token, readers).await }))
    }

    /// Kills the job's whole process tree. `false` if no such job is running.
    pub fn cancel(&self, job_id: &str) -> bool {
        let mut jobs = self.lock();
        let Some(job) = jobs.get_mut(job_id) else {
            return false;
        };
        if let Ok(Some(_)) = job.child.try_wait() {
            // Already exited on its own: its real exit code will be reported.
            return false;
        }
        if job.child.start_kill().is_err() {
            return false;
        }
        job.cancelled = true;
        true
    }

    /// Kills every job's process tree and empties the registry. Called when
    /// the app exits; blocks for at most [`KILL_ALL_REAP`] to reap the jobs.
    pub fn kill_all(&self) {
        let mut jobs: Vec<Job> = self.lock().drain().map(|(_, job)| job).collect();
        for job in &mut jobs {
            let _ = job.child.start_kill();
        }
        let deadline = Instant::now() + KILL_ALL_REAP;
        loop {
            jobs.retain_mut(|job| matches!(job.child.try_wait(), Ok(None)));
            if jobs.is_empty() || Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[cfg(test)]
    fn is_empty(&self) -> bool {
        self.lock().is_empty()
    }

    #[cfg(test)]
    fn pid(&self, job_id: &str) -> Option<u32> {
        self.lock().get(job_id).and_then(|job| job.child.id())
    }

    /// Waits for the job to exit, then for its readers to drain, and yields
    /// the exit code. The child stays in the registry until it has exited, so
    /// `cancel` and `kill_all` can reach it the whole time.
    async fn supervise(
        self,
        job_id: String,
        token: u64,
        readers: Vec<JoinHandle<()>>,
    ) -> Option<i32> {
        let aborts: Vec<_> = readers.iter().map(JoinHandle::abort_handle).collect();
        let mut drained = Box::pin(async move {
            for reader in readers {
                let _ = reader.await;
            }
        });
        let mut readers_done = false;

        let code = loop {
            if let Some(code) = self.reap(&job_id, token) {
                break code;
            }
            if readers_done {
                tokio::time::sleep(EXIT_POLL).await;
            } else {
                // EOF on both pipes usually means the process just exited:
                // wake up right away instead of waiting for the next tick.
                tokio::select! {
                    () = &mut drained => readers_done = true,
                    () = tokio::time::sleep(EXIT_POLL) => {}
                }
            }
        };

        if !readers_done
            && tokio::time::timeout(DRAIN_GRACE, &mut drained)
                .await
                .is_err()
        {
            for abort in &aborts {
                abort.abort();
            }
            // Wait for the aborts to land so no line can follow the exit.
            drained.await;
        }
        code
    }

    /// `Some(code)` once the job is over (and removes it), `None` while it runs.
    fn reap(&self, job_id: &str, token: u64) -> Option<Option<i32>> {
        let mut jobs = self.lock();
        let job = match jobs.get_mut(job_id) {
            Some(job) if job.token == token => job,
            // Taken (and killed) by `kill_all`.
            _ => return Some(None),
        };
        let status = match job.child.try_wait() {
            Ok(None) => return None,
            Ok(Some(status)) => status.code(),
            Err(_) => None,
        };
        let mut job = jobs.remove(job_id)?;
        // The leader is gone: take down anything it left behind in its group.
        let _ = job.child.start_kill();
        Some(if job.cancelled { None } else { status })
    }
}

/// Runs `program` to completion and collects its output (used by the probe).
pub async fn capture(program: &Path, args: &[String]) -> io::Result<Capture> {
    let output = spawn_group(program, args)?.wait_with_output().await?;
    Ok(Capture {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn spawn_group(program: &Path, args: &[String]) -> io::Result<AsyncGroupChild> {
    // Unix: exec fails with ETXTBSY if the binary was just written (e.g. a
    // fresh download) while another thread forked, because the forked child
    // briefly inherits the writer's fd. It clears within milliseconds.
    let mut attempts = 0;
    loop {
        match try_spawn_group(program, args) {
            Err(e) if e.kind() == io::ErrorKind::ExecutableFileBusy && attempts < 5 => {
                attempts += 1;
                std::thread::sleep(Duration::from_millis(20));
            }
            result => return result,
        }
    }
}

fn try_spawn_group(program: &Path, args: &[String]) -> io::Result<AsyncGroupChild> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // yt-dlp is Python: force UTF-8 pipes so non-ASCII titles and paths
        // survive (Windows would otherwise use the ANSI code page).
        .env("PYTHONIOENCODING", "utf-8");
    let mut group = command.group();
    // Windows: closing the Job Object (also if the app crashes) kills the
    // tree. No effect on Unix.
    group.kill_on_drop(true);
    #[cfg(windows)]
    group.creation_flags(CREATE_NO_WINDOW);
    group.spawn()
}

/// Forwards each line of `pipe`. Decodes lossily: an invalid byte must not
/// stop the reader, or the child would block on a full pipe.
async fn pump(pipe: impl AsyncRead + Unpin, stream: Stream, on_line: LineSink) {
    let mut reader = BufReader::new(pipe);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n' | b'\r')) {
                    buf.pop();
                }
                on_line(stream, String::from_utf8_lossy(&buf).into_owned());
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri adapter
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinePayload {
    job_id: String,
    stream: Stream,
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitPayload {
    job_id: String,
    code: Option<i32>,
}

/// Path of the yt-dlp binary.
///
/// Stub until Task 11, which replaces the body with
/// `Ok(crate::deps::ytdlp_path(app))`.
fn ytdlp_bin(_app: &AppHandle) -> Result<PathBuf, String> {
    std::env::var_os("YTDLP_GUI_BIN")
        .map(PathBuf::from)
        .ok_or_else(|| "yt-dlp not found (set YTDLP_GUI_BIN)".to_string())
}

/// Starts a download job. Resolves once yt-dlp is running; output arrives as
/// `job://line` events and the end as one `job://exit` event.
#[tauri::command]
pub async fn run_ytdlp(
    app: AppHandle,
    registry: State<'_, JobRegistry>,
    job_id: String,
    args: Vec<String>,
) -> Result<(), String> {
    let bin = ytdlp_bin(&app)?;
    let line_app = app.clone();
    let line_job_id = job_id.clone();
    let on_line: LineSink = Arc::new(move |stream, line| {
        let payload = LinePayload {
            job_id: line_job_id.clone(),
            stream,
            line,
        };
        let _ = line_app.emit("job://line", payload);
    });
    let handle = registry
        .spawn(job_id.clone(), &bin, &args, on_line)
        .map_err(|e| format!("failed to start yt-dlp: {e}"))?;
    tauri::async_runtime::spawn(async move {
        let code = handle.await.unwrap_or(None);
        let _ = app.emit("job://exit", ExitPayload { job_id, code });
    });
    Ok(())
}

/// Runs yt-dlp to completion and returns its output (used by the probe).
#[tauri::command]
pub async fn run_ytdlp_capture(app: AppHandle, args: Vec<String>) -> Result<Capture, String> {
    let bin = ytdlp_bin(&app)?;
    capture(&bin, &args)
        .await
        .map_err(|e| format!("failed to run yt-dlp: {e}"))
}

/// Kills a job's process tree. `false` if the job is not running.
#[tauri::command]
pub async fn cancel_job(registry: State<'_, JobRegistry>, job_id: String) -> Result<bool, String> {
    Ok(registry.cancel(&job_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};
    use sysinfo::{Pid, ProcessStatus, ProcessesToUpdate, System};

    const TIMEOUT: Duration = Duration::from_secs(15);

    #[cfg(unix)]
    const ECHO_A_B: &str = "echo a; echo b";
    #[cfg(windows)]
    const ECHO_A_B: &str = "echo a& echo b";

    // A shell that starts a long-running grandchild and waits for it.
    #[cfg(unix)]
    const LONG_WITH_GRANDCHILD: &str = "sleep 30 & wait";
    #[cfg(windows)]
    const LONG_WITH_GRANDCHILD: &str = "ping -n 30 127.0.0.1";
    #[cfg(unix)]
    const GRANDCHILD_NAME: &str = "sleep";
    #[cfg(windows)]
    const GRANDCHILD_NAME: &str = "ping";

    #[cfg(unix)]
    fn shell(script: &str) -> (PathBuf, Vec<String>) {
        ("sh".into(), vec!["-c".into(), script.into()])
    }
    #[cfg(windows)]
    fn shell(script: &str) -> (PathBuf, Vec<String>) {
        ("cmd".into(), vec!["/c".into(), script.into()])
    }

    type Lines = Arc<Mutex<Vec<(Stream, String)>>>;

    fn collector() -> (Lines, LineSink) {
        let lines: Lines = Arc::default();
        let sink_lines = lines.clone();
        let sink: LineSink = Arc::new(move |stream, line| {
            sink_lines.lock().unwrap().push((stream, line));
        });
        (lines, sink)
    }

    fn noop_sink() -> LineSink {
        Arc::new(|_, _| {})
    }

    fn line(stream: Stream, text: &str) -> (Stream, String) {
        (stream, text.to_string())
    }

    async fn exit_code(handle: JoinHandle<Option<i32>>) -> Option<i32> {
        tokio::time::timeout(TIMEOUT, handle)
            .await
            .expect("job did not finish in time")
            .expect("job task panicked")
    }

    /// Alive = exists and is not a zombie (a zombie has already terminated).
    fn is_alive(pid: u32) -> bool {
        let pid = Pid::from_u32(pid);
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
        sys.process(pid)
            .is_some_and(|p| p.status() != ProcessStatus::Zombie)
    }

    fn grandchildren(leader: u32) -> Vec<u32> {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        sys.processes()
            .values()
            .filter(|p| p.parent() == Some(Pid::from_u32(leader)))
            .filter(|p| {
                p.name()
                    .to_string_lossy()
                    .to_lowercase()
                    .starts_with(GRANDCHILD_NAME)
            })
            .map(|p| p.pid().as_u32())
            .collect()
    }

    async fn wait_until(what: &str, cond: impl Fn() -> bool) {
        let deadline = Instant::now() + TIMEOUT;
        while !cond() {
            assert!(Instant::now() < deadline, "timed out waiting for {what}");
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    #[tokio::test]
    async fn spawn_streams_lines() {
        let registry = JobRegistry::default();
        let (lines, sink) = collector();
        let (program, args) = shell(ECHO_A_B);

        let handle = registry
            .spawn("job-1".into(), &program, &args, sink)
            .expect("spawn");

        assert_eq!(exit_code(handle).await, Some(0));
        // Every line is delivered before the job reports its exit.
        assert_eq!(
            *lines.lock().unwrap(),
            vec![line(Stream::Stdout, "a"), line(Stream::Stdout, "b")]
        );
        assert!(registry.is_empty(), "finished job must leave the registry");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancel_kills_tree() {
        let registry = JobRegistry::default();
        let (program, args) = shell(LONG_WITH_GRANDCHILD);
        let handle = registry
            .spawn("long".into(), &program, &args, noop_sink())
            .expect("spawn");
        let leader = registry.pid("long").expect("leader pid");

        wait_until("grandchild to start", || !grandchildren(leader).is_empty()).await;
        let grandchild = grandchildren(leader)[0];

        assert!(registry.cancel("long"));
        assert_eq!(exit_code(handle).await, None, "cancelled job reports null");
        wait_until("grandchild to die", || !is_alive(grandchild)).await;
        wait_until("leader to die", || !is_alive(leader)).await;
        assert!(registry.is_empty());
        assert!(!registry.cancel("long"), "already gone");
        assert!(!registry.cancel("unknown"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn kill_all_stops_every_job() {
        let registry = JobRegistry::default();
        let (program, args) = shell(LONG_WITH_GRANDCHILD);
        let a = registry
            .spawn("a".into(), &program, &args, noop_sink())
            .expect("spawn a");
        let b = registry
            .spawn("b".into(), &program, &args, noop_sink())
            .expect("spawn b");
        let pids = [registry.pid("a").unwrap(), registry.pid("b").unwrap()];

        registry.kill_all();

        assert!(registry.is_empty(), "kill_all empties the registry");
        assert_eq!(exit_code(a).await, None);
        assert_eq!(exit_code(b).await, None);
        for pid in pids {
            wait_until("job to die", || !is_alive(pid)).await;
        }
    }

    #[tokio::test]
    async fn path_with_spaces() {
        let dir = tempfile::tempdir().unwrap();
        let spaced = dir.path().join("pasta com espaço");
        std::fs::create_dir(&spaced).unwrap();

        #[cfg(unix)]
        let (source, name, args) = (PathBuf::from("/bin/sh"), "sh", ["-c", "echo ok"]);
        #[cfg(windows)]
        let (source, name, args) = (
            PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into()))
                .join("System32")
                .join("cmd.exe"),
            "cmd.exe",
            ["/c", "echo ok"],
        );
        let binary = spaced.join(name);
        std::fs::copy(&source, &binary).unwrap();
        let args: Vec<String> = args.iter().map(|a| a.to_string()).collect();

        let registry = JobRegistry::default();
        let (lines, sink) = collector();
        let handle = registry
            .spawn("spaced".into(), &binary, &args, sink)
            .expect("spawn from a path with spaces");
        assert_eq!(exit_code(handle).await, Some(0));
        assert_eq!(*lines.lock().unwrap(), vec![line(Stream::Stdout, "ok")]);

        let captured = capture(&binary, &args).await.expect("capture");
        assert_eq!(captured.code, 0);
        assert_eq!(captured.stdout.trim_end(), "ok");
        assert_eq!(captured.stderr, "");
    }

    #[tokio::test]
    async fn spawn_failure_and_duplicate_id_leave_no_stray_entry() {
        let registry = JobRegistry::default();
        let missing = PathBuf::from("definitely-not-a-real-binary-ytdlp-gui");
        assert!(
            registry
                .spawn("missing".into(), &missing, &[], noop_sink())
                .is_err()
        );
        assert!(registry.is_empty(), "failed spawn must not register a job");

        let (program, args) = shell(LONG_WITH_GRANDCHILD);
        let handle = registry
            .spawn("dup".into(), &program, &args, noop_sink())
            .expect("spawn");
        let err = registry
            .spawn("dup".into(), &program, &args, noop_sink())
            .expect_err("duplicate id must be rejected");
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);

        assert!(registry.cancel("dup"));
        assert_eq!(exit_code(handle).await, None);
        assert!(registry.is_empty());
    }
}
