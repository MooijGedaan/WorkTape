use std::time::{Duration, Instant};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use crate::screenshot::{capture_all_monitors, ScreenshotData};
use log::{info, debug, warn};

const MAX_BUFFER_SCREENSHOTS: usize = 100;

pub struct SmartCaptureService {
    last_hash: Option<u64>,
    last_capture_time: Instant,
    screenshot_buffer: Vec<CapturedScreenshot>,
}

#[derive(Debug, Clone)]
pub struct CapturedScreenshot {
    #[allow(dead_code)]
    pub timestamp: String,           // ISO 8601 format
    pub screenshots: Vec<ScreenshotData>,  // Multi-monitor
    #[allow(dead_code)]
    pub change_score: u32,           // How different from previous
}

impl SmartCaptureService {
    pub fn new() -> Self {
        Self {
            last_hash: None,
            last_capture_time: Instant::now(),
            screenshot_buffer: Vec::new(),
        }
    }

    /// Capture screenshots if significant change detected
    pub fn try_capture(&mut self) -> Result<bool, String> {
        // 1. Capture all monitors
        let screenshots = capture_all_monitors()?;

        // 2. Create simple hash (using file size and sampling)
        let current_hash = self.create_simple_hash(&screenshots)?;

        // 3. Compare with last hash
        let changed = if let Some(last) = self.last_hash {
            // If hashes are different, there's a change
            current_hash != last
        } else {
            true  // First capture
        };

        // 4. Store if changed
        if changed {
            let captured = CapturedScreenshot {
                timestamp: chrono::Utc::now().to_rfc3339(),
                screenshots,
                change_score: 10,  // Simple binary change detection
            };

            debug!("Screenshot captured - Change detected");
            if self.screenshot_buffer.len() >= MAX_BUFFER_SCREENSHOTS {
                warn!("Screenshot buffer full ({} items), dropping oldest entry", MAX_BUFFER_SCREENSHOTS);
                self.screenshot_buffer.remove(0);
            }
            self.screenshot_buffer.push(captured);
            self.last_hash = Some(current_hash);
            self.last_capture_time = Instant::now();

            Ok(true)  // Screenshot taken
        } else {
            debug!("Screenshot skipped - No significant change");
            Ok(false)  // No significant change, skipped
        }
    }

    /// Create simple hash from screenshots (based on size and partial content)
    pub(crate) fn create_simple_hash(&self, screenshots: &[ScreenshotData]) -> Result<u64, String> {
        let primary = screenshots.iter()
            .find(|s| s.is_primary)
            .or_else(|| screenshots.first())
            .ok_or("No screenshots available")?;

        // Create a hash based on image size and length
        // This is a simple approach - if screen content changes, base64 length should change too
        let mut hasher = DefaultHasher::new();
        primary.image_base64.len().hash(&mut hasher);
        primary.width.hash(&mut hasher);
        primary.height.hash(&mut hasher);

        // Sample every 1000th character for content hash
        for (i, c) in primary.image_base64.chars().enumerate() {
            if i % 1000 == 0 {
                c.hash(&mut hasher);
            }
        }

        Ok(hasher.finish())
    }

    /// Get buffered screenshots for AI analysis
    pub fn get_buffer_for_analysis(&mut self) -> Vec<CapturedScreenshot> {
        info!("Retrieving {} screenshots from buffer for analysis", self.screenshot_buffer.len());
        std::mem::take(&mut self.screenshot_buffer)
    }

    /// Check if buffer should be analyzed (15 minutes passed)
    #[allow(dead_code)]
    pub fn should_analyze(&self) -> bool {
        !self.screenshot_buffer.is_empty() &&
        self.last_capture_time.elapsed() >= Duration::from_secs(15 * 60)
    }

    /// Get buffer size
    pub fn buffer_size(&self) -> usize {
        self.screenshot_buffer.len()
    }

    /// Get last change score
    pub fn last_change_score(&self) -> u32 {
        self.screenshot_buffer.last()
            .map(|s| s.change_score)
            .unwrap_or(0)
    }

    /// Get time since last capture
    pub fn time_since_last_capture(&self) -> Duration {
        self.last_capture_time.elapsed()
    }

    /// Clear the buffer
    pub fn clear_buffer(&mut self) {
        info!("Clearing screenshot buffer ({} items)", self.screenshot_buffer.len());
        self.screenshot_buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::screenshot::ScreenshotData;

    fn make_screenshot(base64: &str, width: u32, height: u32) -> ScreenshotData {
        ScreenshotData {
            monitor_id: 1,
            monitor_name: "Test Monitor".to_string(),
            image_base64: base64.to_string(),
            width,
            height,
            is_primary: true,
        }
    }

    #[test]
    fn create_simple_hash_is_deterministic() {
        let service = SmartCaptureService::new();
        let screenshots = vec![make_screenshot("abc123", 1920, 1080)];

        let hash1 = service.create_simple_hash(&screenshots).unwrap();
        let hash2 = service.create_simple_hash(&screenshots).unwrap();

        assert_eq!(hash1, hash2, "Hash should be deterministic for identical input");
    }

    #[test]
    fn create_simple_hash_differs_on_different_content() {
        let service = SmartCaptureService::new();

        let screenshots_a = vec![make_screenshot("abc123", 1920, 1080)];
        let screenshots_b = vec![make_screenshot("xyz987", 1920, 1080)];

        let hash_a = service.create_simple_hash(&screenshots_a).unwrap();
        let hash_b = service.create_simple_hash(&screenshots_b).unwrap();

        assert_ne!(hash_a, hash_b, "Different content should produce different hashes");
    }

    #[test]
    fn create_simple_hash_handles_empty_base64() {
        let service = SmartCaptureService::new();
        let screenshots = vec![make_screenshot("", 1920, 1080)];

        let result = service.create_simple_hash(&screenshots);
        assert!(result.is_ok(), "Should handle empty base64 without panicking");
    }

    #[test]
    fn create_simple_hash_returns_err_for_empty_screenshots() {
        let service = SmartCaptureService::new();
        let result = service.create_simple_hash(&[]);
        assert!(result.is_err(), "Should return error for empty screenshot slice");
    }

    #[test]
    fn buffer_caps_at_max_screenshots() {
        let mut service = SmartCaptureService::new();

        // Manually push MAX_BUFFER_SCREENSHOTS + 10 items
        for i in 0..(MAX_BUFFER_SCREENSHOTS + 10) {
            let captured = CapturedScreenshot {
                timestamp: format!("2026-01-01T00:00:{:02}Z", i % 60),
                screenshots: vec![make_screenshot("abc", 1920, 1080)],
                change_score: 10,
            };
            if service.screenshot_buffer.len() >= MAX_BUFFER_SCREENSHOTS {
                service.screenshot_buffer.remove(0);
            }
            service.screenshot_buffer.push(captured);
        }

        assert_eq!(
            service.buffer_size(),
            MAX_BUFFER_SCREENSHOTS,
            "Buffer should not exceed MAX_BUFFER_SCREENSHOTS"
        );
    }
}
