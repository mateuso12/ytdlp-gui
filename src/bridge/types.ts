/**
 * The contract between the UI and the native shell. Everything the UI needs
 * from Tauri (processes, files, settings, updates) goes through this interface,
 * so components never import `@tauri-apps/*` and tests can swap in a mock.
 *
 * Payload shapes mirror `src-tauri/src/process.rs` and `src-tauri/src/deps.rs`.
 */

/** Result of a captured yt-dlp run. `code` is -1 when the process had no exit code. */
export interface ProbeResult {
  code: number
  stdout: string
  stderr: string
}

/** `job://line` payload. */
export interface LineEvent {
  jobId: string
  stream: 'stdout' | 'stderr'
  line: string
}

/** `job://exit` payload. `code` is null when the process was killed by a signal. */
export interface ExitEvent {
  jobId: string
  code: number | null
}

/** The dependencies the app can manage. */
export type DepName = 'ytdlp' | 'ffmpeg' | 'deno'

/** `deps://progress` payload. `total` is null when the server did not say. */
export interface DepsProgress {
  which: DepName
  received: number
  total: number | null
}

export interface YtdlpStatus {
  path: string
  version: string
}

export interface ToolStatus {
  path: string
  version: string
  /** `app`: downloaded by this app. `system`: found on PATH. */
  source: 'app' | 'system'
}

/** What is installed. A missing (or broken) tool is `null`. */
export interface DepsStatus {
  ytdlp: YtdlpStatus | null
  ffmpeg: ToolStatus | null
  deno: ToolStatus | null
}

export type Platform = 'windows' | 'macos' | 'linux'

export interface AvailableUpdate {
  version: string
  install(): Promise<void>
}

export interface Bridge {
  /** Runs yt-dlp to completion and captures its output. Never rejects on a non-zero exit. */
  probe(args: string[]): Promise<ProbeResult>
  /** Starts a streaming job; output arrives through `onLine`, the end through `onExit`. */
  run(jobId: string, args: string[]): Promise<void>
  /** Kills the job's process tree. Resolves to false if the job was not running. */
  cancel(jobId: string): Promise<boolean>
  /** Subscribes to job output lines. Resolves to the unsubscribe function. */
  onLine(cb: (e: LineEvent) => void): Promise<() => void>
  /** Subscribes to job exits. Resolves to the unsubscribe function. */
  onExit(cb: (e: ExitEvent) => void): Promise<() => void>
  deps: {
    status(): Promise<DepsStatus>
    install(which: DepName): Promise<void>
    /** Updates yt-dlp on the given channel; resolves to the new version. */
    update(channel: 'stable' | 'nightly'): Promise<string>
    onProgress(cb: (p: DepsProgress) => void): Promise<() => void>
  }
  store: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
  }
  os: {
    openPath(path: string): Promise<void>
    revealPath(path: string): Promise<void>
    /** Resolves to the chosen folder, or null if the dialog was cancelled. */
    pickFolder(): Promise<string | null>
    readClipboard(): Promise<string>
    writeClipboard(text: string): Promise<void>
    /** The user's Videos folder. */
    videoDir(): Promise<string>
    platform(): Platform
  }
  updater: {
    /** Resolves to the available update, or null when up to date. */
    check(): Promise<AvailableUpdate | null>
  }
}
