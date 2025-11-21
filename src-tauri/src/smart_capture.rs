use std::time::{Duration, Instant};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use crate::screenshot::{capture_all_monitors, ScreenshotData};
use log::{info, debug};

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
    fn create_simple_hash(&self, screenshots: &[ScreenshotData]) -> Result<u64, String> {
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
