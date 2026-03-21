use device_query::{DeviceQuery, DeviceState};
use std::panic::AssertUnwindSafe;
use std::time::{Duration, Instant};
use log::{info, warn};

pub struct IdleDetector {
    device_state: Option<DeviceState>,
    last_activity_time: Instant,
    idle_threshold: Duration,
    last_mouse_pos: (i32, i32),
    last_keys_count: usize,
}

impl IdleDetector {
    pub fn new(idle_threshold_minutes: u64) -> Self {
        // DeviceState::new() panics on macOS if Accessibility permissions are not granted.
        // Catch that panic so the app can still run in degraded mode (no idle detection).
        let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let ds = DeviceState::new();
            let pos = ds.get_mouse().coords;
            (ds, pos)
        }));

        let (device_state, last_mouse_pos) = match result {
            Ok((ds, pos)) => (Some(ds), pos),
            Err(_) => {
                warn!(
                    "Failed to initialize DeviceState — Accessibility permissions may not be \
                     granted. Idle detection is disabled; the auto-logger will assume the \
                     system is always active."
                );
                (None, (0, 0))
            }
        };

        Self {
            device_state,
            last_activity_time: Instant::now(),
            idle_threshold: Duration::from_secs(idle_threshold_minutes * 60),
            last_mouse_pos,
            last_keys_count: 0,
        }
    }

    /// Check if system is currently idle.
    /// Returns `false` (not idle) when Accessibility permissions are unavailable.
    pub fn is_idle(&mut self) -> bool {
        let ds = match &self.device_state {
            Some(ds) => ds,
            None => return false, // no permissions — assume active
        };

        let keys = ds.get_keys();
        let mouse = ds.get_mouse();

        let mut activity_detected = false;

        if mouse.coords != self.last_mouse_pos {
            activity_detected = true;
            self.last_mouse_pos = mouse.coords;
        }

        if mouse.button_pressed[0] || mouse.button_pressed[1] || mouse.button_pressed[2] {
            activity_detected = true;
        }

        let current_keys_count = keys.len();
        if current_keys_count != self.last_keys_count {
            activity_detected = true;
            self.last_keys_count = current_keys_count;
        }

        if activity_detected {
            self.last_activity_time = Instant::now();
            false
        } else {
            let is_idle = self.last_activity_time.elapsed() > self.idle_threshold;
            if is_idle {
                let idle_minutes = self.last_activity_time.elapsed().as_secs() / 60;
                info!("System idle for {} minutes", idle_minutes);
            }
            is_idle
        }
    }

    /// Get time since last activity
    #[allow(dead_code)]
    pub fn time_since_activity(&self) -> Duration {
        self.last_activity_time.elapsed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn time_since_activity_increases_over_time() {
        let detector = IdleDetector::new(5);

        let t1 = detector.time_since_activity();
        thread::sleep(Duration::from_millis(20));
        let t2 = detector.time_since_activity();

        assert!(t2 > t1, "time_since_activity should increase over time");
    }

    #[test]
    fn new_detector_is_not_idle_immediately() {
        let mut detector = IdleDetector::new(5);
        assert!(
            detector.time_since_activity().as_secs() < 1,
            "A newly created IdleDetector should have near-zero idle time"
        );
        let _ = detector.is_idle();
    }
}
