mod deps;
mod process;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(process::JobRegistry::default())
        .invoke_handler(tauri::generate_handler![
            process::run_ytdlp,
            process::run_ytdlp_capture,
            process::cancel_job,
            deps::deps_status,
            deps::deps_install,
            deps::deps_update_ytdlp,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Leave no yt-dlp/ffmpeg process tree running after the app is gone.
            if let tauri::RunEvent::Exit = event {
                app.state::<process::JobRegistry>().kill_all();
            }
        });
}
