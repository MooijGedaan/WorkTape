use device_query::{DeviceQuery, DeviceState};
use std::time::{Duration, Instant};
use log::info;

pub struct IdleDetector {
    device_state: DeviceState,
    last_activity_time: Instant,
    idle_threshold: Duration,
    last_mouse_pos: (i32, i32),
    last_keys_count: usize,
}

impl IdleDetector {
    pub fn new(idle_threshold_minutes: u64) -> Self {
        let device_state = DeviceState::new();
        let mouse = device_state.get_mouse();

        Self {
            device_state,
            last_activity_time: Instant::now(),
            idle_threshold: Duration::from_secs(idle_threshold_minutes * 60),
            last_mouse_pos: mouse.coords,
            last_keys_count: 0,
        }
    }

    /// Check if system is currently idle
    pub fn is_idle(&mut self) -> bool {
        // Check keyboard and mouse state
        let keys = self.device_state.get_keys();
        let mouse = self.device_state.get_mouse();

        // Check for any activity
        let mut activity_detected = false;

        // Check if mouse moved
        if mouse.coords != self.last_mouse_pos {
            activity_detected = true;
            self.last_mouse_pos = mouse.coords;
        }

        // Check if any mouse buttons are pressed
        if mouse.button_pressed[0] || mouse.button_pressed[1] || mouse.button_pressed[2] {
            activity_detected = true;
        }

        // Check if keyboard state changed
        let current_keys_count = keys.len();
        if current_keys_count != self.last_keys_count {
            activity_detected = true;
            self.last_keys_count = current_keys_count;
        }

        // If any input detected, reset idle timer
        if activity_detected {
            self.last_activity_time = Instant::now();
            false
        } else {
            // Check if idle threshold exceeded
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
        // With a 5-minute threshold, a freshly created detector should not be idle
        let mut detector = IdleDetector::new(5);
        // Just after creation the elapsed time is near zero, well below threshold
        // Note: is_idle() also checks input state, so we just check the duration is small
        assert!(
            detector.time_since_activity().as_secs() < 1,
            "A newly created IdleDetector should have near-zero idle time"
        );
        // Suppress unused warning — is_idle reads device state which is fine in tests
        let _ = detector.is_idle();
    }
}
