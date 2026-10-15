#!/usr/bin/env node
/**
 * Captures real yt-dlp output into src/core/__fixtures__/. The fixtures are
 * the contract with yt-dlp: re-run this script when yt-dlp changes its output.
 *
 * Run from the repository root:
 *
 *   node scripts/capture-fixtures.mjs [only ...]
 *
 * Optional arguments name the groups to (re)capture: probe, progress, errors.
 * Without arguments, everything is captured.
 *
 * Binaries live in .cache/ (git-ignored). Environment variables:
 *
 *   YTDLP_BIN      yt-dlp executable. Default: .cache/yt-dlp.exe on Windows,
 *                  .cache/yt-dlp_linux on Linux, .cache/yt-dlp_macos on macOS;
 *                  downloaded from the latest GitHub release when missing.
 *   FFMPEG_BIN     ffmpeg directory (or binary) passed as --ffmpeg-location.
 *                  Needed for the progress fixtures (merge, mp3 conversion).
 *   JS_RUNTIME     Optional "--js-runtimes" value, e.g. "deno:.cache/deno". With a JS
 *                  runtime YouTube returns the full DASH format list and plain
 *                  HTTP downloads (byte-accurate progress); without one only
 *                  HLS formats are offered. Used by the probe and progress
 *                  captures; the error captures deliberately run without it so
 *                  the stderr keeps the real "No supported JavaScript runtime"
 *                  warning that the app's error mapper must see through.
 *   YTDLP_RUNNER   Command prefix used to launch YTDLP_BIN, e.g.
 *                  "wsl -d Ubuntu --exec". Use it when the native binary is
 *                  blocked (Windows Smart App Control) and a Linux build runs
 *                  in WSL. Paths are passed relative to the repo root, so they
 *                  resolve the same way in both worlds.
 *
 * Example (Windows, Linux binaries inside WSL):
 *
 *   YTDLP_RUNNER="wsl -d Ubuntu --exec" YTDLP_BIN=.cache/yt-dlp_linux \
 *     FFMPEG_BIN=.cache/ffmpeg/bin JS_RUNTIME=deno:.cache/deno node scripts/capture-fixtures.mjs
 *
 * Media is written to .cache/dl and is never committed. No cookies are used.
 * Fixtures marked "hand-written" in their first line cannot be reproduced on
 * demand (they need an age-gated video, an HTTP 429, a Chrome cookie lock or a
 * full disk) and are not touched by this script.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

const FIXTURES = 'src/core/__fixtures__'
const CACHE = '.cache'
const DOWNLOADS = `${CACHE}/dl`

// Must stay identical to the constants used by the progress parser and buildArgs.
const PROGRESS_TEMPLATE = 'download:[ytdlp-gui]%(progress)j'
const PRINT_FILE = 'after_move:[ytdlp-gui-file]%(filepath)s'

const VIDEO_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' // Big Buck Bunny (Blender)
const SUBS_URL = 'https://www.youtube.com/watch?v=WhWc3b3KhnY' // Spring (Blender): has manual "en" subtitles; Big Buck Bunny has none
const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv' // Blender "Settlers"
const CHANNEL_URL = 'https://www.youtube.com/@BlenderOfficial' // channel root: tabs are nested playlists

const platformBinary = {
  win32: 'yt-dlp.exe',
  linux: 'yt-dlp_linux',
  darwin: 'yt-dlp_macos',
}[process.platform]

const runner = (process.env.YTDLP_RUNNER ?? '').split(/\s+/).filter(Boolean)
const ytdlpBin = process.env.YTDLP_BIN ?? `${CACHE}/${platformBinary}`
const ffmpegBin = process.env.FFMPEG_BIN ?? null
const jsRuntimeArgs = process.env.JS_RUNTIME ? ['--js-runtimes', process.env.JS_RUNTIME] : []

async function ensureYtdlp() {
  if (existsSync(ytdlpBin)) return
  if (process.env.YTDLP_BIN) throw new Error(`YTDLP_BIN not found: ${ytdlpBin}`)
  const name = platformBinary
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${name}`
  console.log(`downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`)
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(ytdlpBin, Buffer.from(await res.arrayBuffer()))
  if (process.platform !== 'win32') chmodSync(ytdlpBin, 0o755)
}

/** Runs yt-dlp and returns { code, stdout, stderr } (utf-8, \r\n normalised to \n). */
function ytdlp(args) {
  const [cmd, ...pre] = runner.length ? [...runner, ytdlpBin] : [ytdlpBin]
  const res = spawnSync(cmd, [...pre, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })
  if (res.error) throw res.error
  return {
    code: res.status,
    stdout: res.stdout.replace(/\r\n/g, '\n'),
    stderr: res.stderr.replace(/\r\n/g, '\n'),
  }
}

const IPV6 = /(?:[0-9a-f]{1,4}(?::|%3A)){7}[0-9a-f]{1,4}/gi
const IP_PARAM = /([?&/]ip[=/])[^&/"s]+/g

/**
 * Removes machine-specific data from captured text: the checkout path (native
 * and WSL /mnt form) and the public IP that YouTube embeds in media URLs.
 */
function sanitise(text) {
  const native = root.split('\\').join('/')
  const wsl = native.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
  return text
    .replaceAll(native + '/', '')
    .replaceAll(wsl + '/', '')
    .replace(IPV6, '0.0.0.0')
    .replace(IP_PARAM, (_, prefix) => `${prefix}0.0.0.0`)
}

function write(name, content) {
  content = sanitise(content)
  mkdirSync(FIXTURES, { recursive: true })
  writeFileSync(join(FIXTURES, name), content)
  console.log(`wrote ${FIXTURES}/${name} (${Buffer.byteLength(content)} bytes)`)
}

function captureJson(name, args) {
  const res = ytdlp(['-J', ...jsRuntimeArgs, ...args])
  if (res.code !== 0) throw new Error(`${name}: yt-dlp exited ${res.code}\n${res.stderr}`)
  // Re-serialise to normalise whitespace; content is untouched.
  write(name, JSON.stringify(JSON.parse(res.stdout)) + '\n')
}

const ffmpegArgs = ffmpegBin ? ['--ffmpeg-location', ffmpegBin] : []

function captureProgress(name, args) {
  // YouTube occasionally answers 403 to the media request; a fresh attempt works.
  for (let attempt = 1; ; attempt++) {
    try {
      return captureProgressOnce(name, args)
    } catch (err) {
      if (attempt >= 3) throw err
      console.warn(`${name}: attempt ${attempt} failed, retrying`)
    }
  }
}

function captureProgressOnce(name, args) {
  rmSync(DOWNLOADS, { recursive: true, force: true })
  const res = ytdlp([
    '--newline',
    '--progress',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--no-quiet', // --print implies --quiet; keep [Merger]/[ExtractAudio] lines on stdout
    '--print',
    PRINT_FILE,
    '-P',
    DOWNLOADS,
    '-o',
    '%(id)s.%(ext)s',
    ...jsRuntimeArgs,
    ...ffmpegArgs,
    ...args,
    VIDEO_URL,
  ])
  if (res.code !== 0) throw new Error(`${name}: yt-dlp exited ${res.code}\n${res.stderr}`)
  write(name, res.stdout)
}

/** Runs a command that must fail and stores its full stderr. */
function captureStderr(name, args) {
  const res = ytdlp(args)
  if (res.code === 0) throw new Error(`${name}: expected failure but yt-dlp succeeded`)
  write(name, res.stderr)
}

const groups = process.argv.slice(2)
const want = (g) => groups.length === 0 || groups.includes(g)

await ensureYtdlp()
console.log(`yt-dlp ${ytdlp(['--version']).stdout.trim()}`)

if (want('probe')) {
  captureJson('video.json', ['--no-playlist', VIDEO_URL])
  captureJson('video-subs.json', ['--no-playlist', SUBS_URL])
  captureJson('playlist-flat.json', ['--flat-playlist', PLAYLIST_URL])
  captureJson('channel-flat.json', ['--flat-playlist', CHANNEL_URL])
}

if (want('progress')) {
  // Smallest video stream merged with the smallest audio stream: two download streams plus the
  // merger. (--download-sections is not used: it delegates to ffmpeg and prints no progress.)
  captureProgress('progress-video.txt', [
    '-f',
    'worstvideo[protocol=https]+worstaudio[protocol=https]',
    '--merge-output-format',
    'mkv',
  ])
  // Audio extraction to mp3: exercises the postprocessing phase.
  captureProgress('progress-audio.txt', [
    '-x',
    '--audio-format',
    'mp3',
    '-f',
    'worstaudio[protocol=https]',
  ])
  rmSync(DOWNLOADS, { recursive: true, force: true })
}

if (want('errors')) {
  // Page that exists but holds no video: generic extractor gives "Unsupported URL".
  captureStderr('stderr-unsupported.txt', ['-J', '--no-playlist', 'https://example.com/'])
  // Video id that does not exist: YouTube answers "This video is unavailable".
  captureStderr('stderr-unavailable.txt', [
    '-J',
    '--no-playlist',
    'https://www.youtube.com/watch?v=xxxxxxxxxxx',
  ])
  // Unreachable proxy. This is the real result of the "invalid proxy" trick: a
  // network/proxy failure, NOT a geo block (see stderr-geo.txt, hand-written).
  captureStderr('stderr-network.txt', [
    '-J',
    '--no-playlist',
    '--proxy',
    'socks5://127.0.0.1:1',
    '--socket-timeout',
    '3',
    '--retries',
    '0',
    '--extractor-retries',
    '0',
    VIDEO_URL,
  ])
  // Audio extraction needs ffmpeg; point yt-dlp at a location that does not exist.
  rmSync(DOWNLOADS, { recursive: true, force: true })
  captureStderr('stderr-ffmpeg.txt', [
    '-x',
    '--audio-format',
    'mp3',
    '-f',
    'worstaudio',
    '--ffmpeg-location',
    `${CACHE}/does-not-exist`,
    '-P',
    DOWNLOADS,
    '-o',
    '%(id)s.%(ext)s',
    VIDEO_URL,
  ])
  rmSync(DOWNLOADS, { recursive: true, force: true })
}
