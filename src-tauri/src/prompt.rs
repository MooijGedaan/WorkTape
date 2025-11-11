use tauri::{Manager, AppHandle, WebviewUrl, WebviewWindowBuilder};
use std::time::Duration;

pub fn start_prompt_timer(app: AppHandle) {
    // Spawn background thread for periodic prompts
    std::thread::spawn(move || {
        loop {
            // Wait for interval (30 minutes = 1800 seconds)
            // For testing, use 60 seconds
            std::thread::sleep(Duration::from_secs(60));

            // Show prompt window
            let _ = show_prompt_window(&app);
        }
    });
}

pub fn show_prompt_window(app: &AppHandle) -> tauri::Result<()> {
    // Check if prompt window already exists
    if let Some(existing) = app.get_webview_window("prompt") {
        let _ = existing.set_focus();
        return Ok(());
    }

    // Get primary monitor size to calculate bottom-right position
    let monitor = app.primary_monitor()?.unwrap();
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();

    // Window dimensions
    let window_width = 400.0;
    let window_height = 280.0;

    // Calculate position for bottom-right corner (with padding)
    let padding = 20.0;
    let x = (monitor_size.width as f64 / scale_factor) - window_width - padding;
    let y = (monitor_size.height as f64 / scale_factor) - window_height - padding - 40.0; // Extra padding for taskbar

    // Create prompt window
    WebviewWindowBuilder::new(
        app,
        "prompt",
        WebviewUrl::App("/prompt".into())
    )
    .title("What are you working on?")
    .inner_size(window_width, window_height)
    .position(x, y)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .decorations(true)
    .always_on_top(true)
    .skip_taskbar(false)
    .visible(true)
    .build()?;

    Ok(())
}

pub fn close_prompt_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("prompt") {
        window.close()?;
    }
    Ok(())
}
