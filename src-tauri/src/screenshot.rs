use serde::{Deserialize, Serialize};
use xcap::Monitor;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotData {
    pub monitor_id: u32,
    pub monitor_name: String,
    pub image_base64: String,  // JPEG compressed, base64 encoded
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// Captures screenshots from all connected monitors
pub fn capture_all_monitors() -> Result<Vec<ScreenshotData>, String> {
    // Get all monitors
    let monitors = Monitor::all()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;

    if monitors.is_empty() {
        return Err("No monitors detected".to_string());
    }

    let mut screenshots = Vec::new();

    for (index, monitor) in monitors.iter().enumerate() {
        // Capture the monitor
        let image = monitor.capture_image()
            .map_err(|e| format!("Failed to capture monitor {}: {}", index, e))?;

        // Get monitor info
        let width = image.width();
        let height = image.height();
        let is_primary = monitor.is_primary()
            .map_err(|e| format!("Failed to check if monitor is primary: {}", e))?;
        let name = monitor.name()
            .map_err(|e| format!("Failed to get monitor name: {}", e))?;

        // Compress to JPEG - convert xcap image to bytes
        let jpeg_data = compress_image_to_jpeg(&image)?;

        // Encode to base64 using the new API
        use base64::Engine;
        let base64_string = base64::engine::general_purpose::STANDARD.encode(&jpeg_data);

        screenshots.push(ScreenshotData {
            monitor_id: index as u32,
            monitor_name: name,
            image_base64: base64_string,
            width,
            height,
            is_primary,
        });
    }

    Ok(screenshots)
}

/// Compresses an xcap RgbaImage to JPEG format
fn compress_image_to_jpeg(image: &xcap::image::RgbaImage) -> Result<Vec<u8>, String> {
    // Convert xcap's RgbaImage to image crate's DynamicImage
    let width = image.width();
    let height = image.height();
    let raw_data = image.as_raw().clone();

    // Create a new RgbaImage from the raw data
    let rgba_image = image::RgbaImage::from_raw(width, height, raw_data)
        .ok_or_else(|| "Failed to create image from raw data".to_string())?;

    let dynamic_image = DynamicImage::ImageRgba8(rgba_image);

    // Encode to JPEG
    let mut buffer = Cursor::new(Vec::new());
    dynamic_image.write_to(&mut buffer, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to compress image: {}", e))?;

    Ok(buffer.into_inner())
}

#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> bool {
    // Attempt to capture a screenshot - will fail without permission on macOS
    match Monitor::all() {
        Ok(monitors) => {
            if monitors.is_empty() {
                return false;
            }
            // Try to capture - will fail without permission
            monitors[0].capture_image().is_ok()
        }
        Err(_) => false,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn check_screen_recording_permission() -> bool {
    // On non-macOS platforms, no special permission needed
    true
}
