mod deps;
mod process;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .manage(process::JobRegistry::default())
        .invoke_handler(tauri::generate_handler![
            process::run_ytdlp,
            process::run_ytdlp_capture,
            process::cancel_job,
            deps::deps_status,
            deps::deps_install,
            deps::deps_update_ytdlp,
        ]);

    // The updater only exists on desktop.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Leave no yt-dlp/ffmpeg process tree running after the app is gone.
            if let tauri::RunEvent::Exit = event {
                app.state::<process::JobRegistry>().kill_all();
            }
        });
}
