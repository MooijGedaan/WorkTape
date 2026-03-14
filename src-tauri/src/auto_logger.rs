use std::sync::{Arc, Mutex};
use std::time::Duration;
use crate::smart_capture::{SmartCaptureService, CapturedScreenshot};
use crate::idle_detector::IdleDetector;
use crate::openai;
use log::{info, error, warn};
use tauri::{async_runtime, Manager};

#[derive(Clone)]
pub struct AutoLoggerService {
    capture_service: Arc<Mutex<SmartCaptureService>>,
    idle_detector: Arc<Mutex<IdleDetector>>,
    enabled: Arc<Mutex<bool>>,
    total_captures_today: Arc<Mutex<u64>>,
    total_analyses_today: Arc<Mutex<u64>>,
    last_analysis_time: Arc<Mutex<Option<String>>>,
    screenshots_per_hour: Arc<Mutex<u64>>,
    api_requests_per_day: Arc<Mutex<u64>>,
}

impl AutoLoggerService {
    pub fn new() -> Self {
        Self {
            capture_service: Arc::new(Mutex::new(SmartCaptureService::new())),
            idle_detector: Arc::new(Mutex::new(IdleDetector::new(5))), // 5 min idle
            enabled: Arc::new(Mutex::new(false)),
            total_captures_today: Arc::new(Mutex::new(0)),
            total_analyses_today: Arc::new(Mutex::new(0)),
            last_analysis_time: Arc::new(Mutex::new(None)),
            screenshots_per_hour: Arc::new(Mutex::new(360)), // Default: every 10 seconds
            api_requests_per_day: Arc::new(Mutex::new(96)), // Default: every 15 minutes
        }
    }

    pub fn update_settings(&self, _app_handle: tauri::AppHandle, screenshots_per_hour: u64, api_requests_per_day: u64) -> Result<(), String> {
        *self.screenshots_per_hour.lock().unwrap_or_else(|e| e.into_inner()) = screenshots_per_hour;
        *self.api_requests_per_day.lock().unwrap_or_else(|e| e.into_inner()) = api_requests_per_day;

        info!("Updated auto-capture settings:");
        info!("  Screenshots per hour: {}", screenshots_per_hour);
        info!("  API requests per day: {}", api_requests_per_day);
        info!("  Capture interval: {} seconds", 3600 / screenshots_per_hour);
        info!("  Analysis interval: {} seconds", 86400 / api_requests_per_day);

        Ok(())
    }

    /// Start the automatic logging service
    pub fn start(&self, app_handle: tauri::AppHandle) {
        println!("🚀 Starting AutoLoggerService...");
        info!("🚀 Starting AutoLoggerService...");

        let capture_service = self.capture_service.clone();
        let idle_detector = self.idle_detector.clone();
        let enabled = self.enabled.clone();
        let total_captures = self.total_captures_today.clone();
        let total_analyses = self.total_analyses_today.clone();
        let last_analysis = self.last_analysis_time.clone();
        let screenshots_per_hour_ref = self.screenshots_per_hour.clone();
        let api_requests_per_day_ref = self.api_requests_per_day.clone();

        // Start capture loop
        let capture_service_clone = capture_service.clone();
        let idle_detector_clone = idle_detector.clone();
        let enabled_clone = enabled.clone();
        let total_captures_clone = total_captures.clone();
        let screenshots_ref = screenshots_per_hour_ref.clone();

        async_runtime::spawn(async move {
            info!("✅ Capture loop started");
            let mut last_capture_instant = std::time::Instant::now();

            loop {
                // Get current interval setting
                let screenshots_per_hour = *screenshots_ref.lock().unwrap_or_else(|e| e.into_inner());
                let capture_interval_secs = 3600 / screenshots_per_hour.max(1);

                // Calculate time until next capture
                let elapsed = last_capture_instant.elapsed();
                let target_duration = Duration::from_secs(capture_interval_secs);

                if elapsed < target_duration {
                    tokio::time::sleep(target_duration - elapsed).await;
                }

                last_capture_instant = std::time::Instant::now();

                // Check if enabled and not idle
                let is_enabled = *enabled_clone.lock().unwrap_or_else(|e| e.into_inner());
                let is_idle = idle_detector_clone.lock().unwrap_or_else(|e| e.into_inner()).is_idle();

                if is_enabled && !is_idle {
                    // Try to capture screenshot
                    if let Ok(mut service) = capture_service_clone.lock() {
                        match service.try_capture() {
                            Ok(captured) => {
                                if captured {
                                    let buffer_size = service.buffer_size();
                                    info!("✅ Screenshot captured (change detected) - buffer now has {} screenshots", buffer_size);
                                    *total_captures_clone.lock().unwrap_or_else(|e| e.into_inner()) += 1;
                                } else {
                                    info!("⏭️  Screenshot skipped (no change detected)");
                                }
                            }
                            Err(e) => error!("❌ Capture error: {}", e),
                        }
                    }
                }
            }
        });

        // Start analysis loop
        let app_handle_for_analysis = app_handle.clone();
        async_runtime::spawn(async move {
            info!("✅ Analysis loop started");
            let mut last_analysis_instant = std::time::Instant::now();

            loop {
                // Get current interval setting
                let api_requests_per_day = *api_requests_per_day_ref.lock().unwrap_or_else(|e| e.into_inner());
                let analysis_interval_secs = 86400 / api_requests_per_day.max(1);

                // Calculate time until next analysis
                let elapsed = last_analysis_instant.elapsed();
                let target_duration = Duration::from_secs(analysis_interval_secs);

                if elapsed < target_duration {
                    tokio::time::sleep(target_duration - elapsed).await;
                }

                last_analysis_instant = std::time::Instant::now();

                // Check if there are screenshots to analyze
                let is_enabled = *enabled.lock().unwrap_or_else(|e| e.into_inner());
                let buffer_size = capture_service.lock()
                    .map(|s| s.buffer_size())
                    .unwrap_or(0);

                info!("Analysis interval tick - enabled: {}, buffer: {}", is_enabled, buffer_size);

                if is_enabled && buffer_size > 0 {
                    info!("Starting analysis for {} screenshots", buffer_size);
                    // Trigger AI analysis
                    let app = app_handle_for_analysis.clone();
                    let service = capture_service.clone();
                    let analyses = total_analyses.clone();
                    let last_time = last_analysis.clone();

                    async_runtime::spawn(async move {
                        match analyze_and_log(app, service).await {
                            Ok(_) => {
                                *analyses.lock().unwrap_or_else(|e| e.into_inner()) += 1;
                                *last_time.lock().unwrap_or_else(|e| e.into_inner()) = Some(chrono::Utc::now().to_rfc3339());
                            }
                            Err(e) => error!("Analysis error: {}", e),
                        }
                    });
                }
            }
        });

        // Start daily cleanup loop for debug logs
        let app_handle_for_cleanup = app_handle.clone();
        async_runtime::spawn(async move {
            info!("✅ Debug log cleanup loop started");

            loop {
                // Run cleanup once per day (24 hours)
                tokio::time::sleep(Duration::from_secs(86400)).await;

                info!("Running daily debug log cleanup...");

                // Get database path
                if let Ok(app_data_dir) = app_handle_for_cleanup.path().app_data_dir() {
                    let db_path = app_data_dir.join("workrecall.db");
                    let db_url = format!("sqlite:{}", db_path.display());

                    // Run cleanup
                    match cleanup_debug_logs_internal(&db_url).await {
                        Ok(count) => {
                            if count > 0 {
                                info!("🗑️  Cleaned up {} old debug log entries", count);
                            } else {
                                info!("✅ No old debug logs to clean up");
                            }
                        }
                        Err(e) => error!("❌ Failed to cleanup debug logs: {}", e),
                    }
                } else {
                    error!("❌ Failed to get app data directory for cleanup");
                }
            }
        });
    }

    pub fn enable(&self) {
        info!("Auto-logging enabled");
        *self.enabled.lock().unwrap_or_else(|e| e.into_inner()) = true;
    }

    pub fn disable(&self) {
        info!("Auto-logging disabled");
        *self.enabled.lock().unwrap_or_else(|e| e.into_inner()) = false;
    }

    pub fn is_enabled(&self) -> bool {
        *self.enabled.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn is_idle(&self) -> bool {
        self.idle_detector.lock().unwrap_or_else(|e| e.into_inner()).is_idle()
    }

    pub fn buffer_size(&self) -> usize {
        self.capture_service.lock().unwrap_or_else(|e| e.into_inner()).buffer_size()
    }

    pub fn last_change_score(&self) -> u32 {
        self.capture_service.lock().unwrap_or_else(|e| e.into_inner()).last_change_score()
    }

    pub fn time_since_last_capture(&self) -> u64 {
        self.capture_service.lock().unwrap_or_else(|e| e.into_inner()).time_since_last_capture().as_secs()
    }

    pub fn total_captures_today(&self) -> u64 {
        *self.total_captures_today.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn total_analyses_today(&self) -> u64 {
        *self.total_analyses_today.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn last_analysis_time(&self) -> Option<String> {
        self.last_analysis_time.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn clear_buffer(&self) {
        self.capture_service.lock().unwrap_or_else(|e| e.into_inner()).clear_buffer();
    }

    pub fn trigger_manual_analysis(&self, app_handle: tauri::AppHandle) -> Result<(), String> {
        let service = self.capture_service.clone();
        let analyses = self.total_analyses_today.clone();
        let last_time = self.last_analysis_time.clone();

        async_runtime::spawn(async move {
            match analyze_and_log(app_handle, service).await {
                Ok(_) => {
                    *analyses.lock().unwrap_or_else(|e| e.into_inner()) += 1;
                    *last_time.lock().unwrap_or_else(|e| e.into_inner()) = Some(chrono::Utc::now().to_rfc3339());
                }
                Err(e) => error!("Manual analysis error: {}", e),
            }
        });

        Ok(())
    }
}

/// Analyze buffered screenshots and create work log entry
/// Check if we've exceeded the daily API rate limit
async fn check_api_rate_limit(app: &tauri::AppHandle) -> Result<bool, String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Get API requests per day setting
    let api_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'api_requests_per_day'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query api_requests_per_day: {}", e))?;

    let api_requests_per_day = api_result
        .and_then(|(val,)| val.parse::<u64>().ok())
        .unwrap_or(96); // Default: 96 per day

    // Get today's usage
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let usage_result = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM api_usage_log WHERE date = ?1"
    )
    .bind(&today)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to query API usage: {}", e))?;

    let current_usage = usage_result.0 as u64;

    info!("📊 API usage today: {}/{}", current_usage, api_requests_per_day);

    // Check if under limit
    let under_limit = current_usage < api_requests_per_day;

    if under_limit {
        // Log this API request
        sqlx::query(
            "INSERT INTO api_usage_log (timestamp, date) VALUES (?1, ?2)"
        )
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&today)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to log API usage: {}", e))?;

        info!("✅ API request logged ({}/{})", current_usage + 1, api_requests_per_day);
    } else {
        warn!("⚠️ API rate limit reached ({}/{}), skipping analysis", current_usage, api_requests_per_day);
    }

    pool.close().await;

    Ok(under_limit)
}

async fn analyze_and_log(
    app: tauri::AppHandle,
    capture_service: Arc<Mutex<SmartCaptureService>>
) -> Result<(), String> {
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    info!("Starting batch analysis...");

    // Check API rate limit first
    if !check_api_rate_limit(&app).await? {
        warn!("API rate limit reached for today, skipping analysis");
        return Ok(());
    }

    // 1. Get screenshots from buffer
    let screenshots = {
        let mut service = capture_service.lock().unwrap_or_else(|e| e.into_inner());
        service.get_buffer_for_analysis()
    };

    if screenshots.is_empty() {
        warn!("No screenshots in buffer to analyze");
        return Ok(());
    }

    let screenshots_count = screenshots.len();
    info!("📸 Retrieved {} screenshot(s) from buffer", screenshots_count);

    // Count total monitor screenshots
    let total_images: usize = screenshots.iter().map(|s| s.screenshots.len()).sum();
    info!("📊 Total images across all captures: {}", total_images);

    // 2. Get today's work log entries for context
    info!("📋 Retrieving today's work entries for context...");
    let today_entries = get_todays_work_entries(&app).await?;
    info!("📋 Found {} previous work entries today", today_entries.len());

    // 3. Send to AI for analysis
    info!("🤖 Sending to OpenAI for AI analysis...");
    let work_description = match analyze_work_batch(screenshots, today_entries).await {
        Ok(desc) => {
            info!("✅ AI analysis successful");
            info!("📝 AI Description: \"{}\"", desc);
            desc
        }
        Err(e) => {
            error!("❌ AI analysis failed: {}", e);
            return Err(e);
        }
    };

    // 4. Store work log entry
    info!("💾 Storing work log entry...");
    store_work_entry(&app, work_description, screenshots_count).await?;

    info!("✅ Analysis complete, work entry created");
    info!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Ok(())
}

async fn get_todays_work_entries(app: &tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Get today's date in YYYY-MM-DD format
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    // Query entries from today
    let entries = sqlx::query_as::<_, (String, String)>(
        "SELECT timestamp, description FROM auto_work_entries
         WHERE DATE(timestamp) = ?
         ORDER BY timestamp ASC"
    )
    .bind(&today)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to query entries: {}", e))?;

    pool.close().await;

    Ok(entries)
}

async fn store_work_entry(
    app: &tauri::AppHandle,
    description: String,
    screenshots_count: usize,
) -> Result<(), String> {
    let timestamp = chrono::Utc::now().to_rfc3339();

    info!("📝 Saving to database...");
    info!("   Timestamp: {}", timestamp);
    info!("   Description: {}", description);
    info!("   Screenshots: {}", screenshots_count);

    // Get the database path
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("workrecall.db");

    let db_url = format!("sqlite:{}", db_path.display());
    info!("📂 Database path: {}", db_url);

    // Connect to database
    let pool = sqlx::sqlite::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| {
            error!("❌ Failed to connect to database: {}", e);
            format!("Failed to connect to database: {}", e)
        })?;

    info!("🔌 Connected to database");

    // Insert the entry
    sqlx::query(
        "INSERT INTO auto_work_entries (session_id, timestamp, description, screenshots_count, created_at)
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(0) // Session ID (0 for now)
    .bind(&timestamp)
    .bind(&description)
    .bind(screenshots_count as i64)
    .bind(&timestamp)
    .execute(&pool)
    .await
    .map_err(|e| {
        error!("❌ Database insert failed: {}", e);
        format!("Failed to store entry: {}", e)
    })?;

    pool.close().await;

    info!("✅ Successfully saved to database!");
    info!("Auto work entry created: {} (from {} screenshots)", description, screenshots_count);
    Ok(())
}

/// Analyze batch of screenshots with same-day context
async fn analyze_work_batch(
    screenshots: Vec<CapturedScreenshot>,
    previous_entries: Vec<(String, String)>,
) -> Result<String, String> {
    info!("🔧 Building AI analysis request...");

    // Build context from previous entries
    let context = if previous_entries.is_empty() {
        info!("📋 No previous entries - first analysis of the day");
        String::from("No previous work entries today.")
    } else {
        info!("📋 Including {} previous entries as context", previous_entries.len());
        let mut ctx = String::from("Previous work entries today:\n");
        for (time, desc) in previous_entries {
            // Format timestamp for readability
            let formatted_time = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&time) {
                dt.format("%I:%M %p").to_string()
            } else {
                time
            };
            ctx.push_str(&format!("- {}: {}\n", formatted_time, desc));
        }
        ctx.push_str("\nNote: The user's current work may be completely different from 15 minutes ago.");
        ctx
    };

    // Build prompt
    let prompt = format!(
        "Analyze these screenshots from the last 15 minutes and describe what the user is working on. \
        Be concise (maximum 2 sentences). Focus on the specific task or activity visible.\n\n\
        Context:\n{}\n\n\
        Based on the screenshots, what is the user currently doing?",
        context
    );

    // Extract base64 images from all screenshots
    let mut all_images = Vec::new();
    for captured in screenshots {
        for screenshot in captured.screenshots {
            all_images.push(screenshot.image_base64);
        }
    }

    info!("📸 Extracted {} images for analysis", all_images.len());

    // Use existing analyze_screenshots function with modified prompt
    // We'll create a custom version here to have more control
    use std::env;

    info!("🔑 Checking API credentials...");
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| {
            error!("❌ OPENAI_API_KEY not set in environment!");
            "OPENAI_API_KEY not set in environment.".to_string()
        })?;

    if api_key.is_empty() || api_key == "sk-your-api-key-here" {
        error!("❌ Invalid API key configuration");
        return Err("Invalid OpenAI API key".to_string());
    }

    info!("✅ API key found ({}...)", &api_key[..15]);

    let api_url = env::var("OPENAI_API_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    info!("🌐 API URL: {}", api_url);

    // Build content parts
    let mut content_parts = vec![
        openai::ContentPart::Text { text: prompt }
    ];

    // Add images (limit to prevent token overflow - max 10 images)
    let max_images = 10.min(all_images.len());
    info!("📤 Including {} images in API request (limited from {})", max_images, all_images.len());

    for base64_data in all_images.into_iter().take(max_images) {
        content_parts.push(openai::ContentPart::ImageUrl {
            image_url: openai::ImageUrl {
                url: format!("data:image/jpeg;base64,{}", base64_data),
            },
        });
    }

    // Call OpenAI API directly
    let request = openai::OpenAIRequest {
        model: "gpt-4o".to_string(),
        messages: vec![
            openai::Message {
                role: "user".to_string(),
                content: openai::MessageContent::MultiModal(content_parts),
            },
        ],
        temperature: 0.5,  // Lower for more consistent descriptions
        max_tokens: 150,   // ~2 sentences
    };

    info!("📡 Calling OpenAI API (model: gpt-4o, max_tokens: 150)...");

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/chat/completions", api_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            error!("❌ API call failed: {}", e);
            format!("API call failed: {}", e)
        })?;

    let status = response.status();
    info!("📥 Received response from OpenAI (status: {})", status);

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!("❌ OpenAI API error ({}): {}", status, error_text);
        return Err(format!("OpenAI API error ({}): {}", status, error_text));
    }

    // Parse response
    info!("🔍 Parsing API response...");
    let api_response: openai::OpenAIResponse = response
        .json()
        .await
        .map_err(|e| {
            error!("❌ Failed to parse response: {}", e);
            format!("Failed to parse response: {}", e)
        })?;

    // Extract text
    let description = api_response
        .choices
        .first()
        .ok_or_else(|| {
            error!("❌ No response choices from AI");
            "No response from AI".to_string()
        })?
        .message
        .content
        .clone();

    let text = match description {
        openai::MessageContent::Text(t) => {
            info!("✅ Extracted text response ({} chars)", t.len());
            t
        }
        openai::MessageContent::MultiModal(parts) => {
            let extracted = parts.into_iter()
                .filter_map(|part| match part {
                    openai::ContentPart::Text { text } => Some(text),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ");
            info!("✅ Extracted multimodal response ({} chars)", extracted.len());
            extracted
        }
    };

    Ok(text)
}

/// Internal function to cleanup old debug logs
async fn cleanup_debug_logs_internal(db_url: &str) -> Result<u32, String> {
    use sqlx::SqlitePool;

    let pool = SqlitePool::connect(db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Get retention days setting
    let retention_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'debug_logs_retention_days'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query retention days: {}", e))?;

    let retention_days = retention_result
        .and_then(|(val,)| val.parse::<i64>().ok())
        .unwrap_or(7);

    // Calculate cutoff date
    let cutoff_date = chrono::Utc::now() - chrono::Duration::days(retention_days);
    let cutoff_str = cutoff_date.to_rfc3339();

    // Delete old logs that have request_messages (debug data)
    let result = sqlx::query(
        "DELETE FROM api_call_logs
         WHERE created_at < ?1
         AND request_messages IS NOT NULL
         AND request_messages != ''"
    )
    .bind(&cutoff_str)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to delete old debug logs: {}", e))?;

    pool.close().await;

    Ok(result.rows_affected() as u32)
}
