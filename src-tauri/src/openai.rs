use serde::{Deserialize, Serialize};
use std::env;
use chrono::Utc;

pub(crate) fn language_instruction(language_code: &str) -> &'static str {
    match language_code {
        "nl" => "Respond entirely in Dutch.",
        _    => "Respond entirely in English.",
    }
}

pub(crate) fn build_system_prompt(language_code: &str) -> String {
    format!(
        "Summarize the user's work day in short summarized bullet points. \
Use as many bullets as needed to reflect the actual variety of work — fewer bullets for a focused day, more for a varied one. \
Tasks that appear multiple times or have more detail deserve more attention; tasks mentioned only once get at most a brief mention. \
Each bullet covers one main topic or task. \
Be brief and factual — this is a personal reminder for the user, not a report for others. \
No intro sentence, no conclusion, no time estimates, no markdown formatting except a dash (-) per bullet. \
Do not list all tasks the user did. \
{}",
        language_instruction(language_code)
    )
}

#[derive(Debug, Serialize)]
pub struct OpenAIRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub temperature: f32,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    MultiModal(Vec<ContentPart>),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIResponse {
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub message: Message,
}

#[derive(Debug, Deserialize)]
pub struct Usage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
}

#[derive(Debug)]
pub(crate) struct WorkEntry {
    pub(crate) description: String,
    pub(crate) timestamp: String,
}

/// Log API call details to the database
async fn log_api_call(
    db_path: &str,
    request_timestamp: &str,
    response_timestamp: Option<&str>,
    endpoint: &str,
    model: &str,
    request_type: &str,
    request_messages: &str,
    temperature: f32,
    max_tokens: u32,
    response_text: Option<&str>,
    response_status: &str,
    error_message: Option<&str>,
    duration_ms: Option<i64>,
    usage: Option<&Usage>,
    screenshot_count: i32,
) -> Result<(), String> {
    use sqlx::SqlitePool;

    let pool = SqlitePool::connect(&format!("sqlite:{}", db_path))
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Check if debug mode is enabled
    let debug_mode_result = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = 'debug_mode'"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| format!("Failed to query debug_mode: {}", e))?;

    let debug_mode = debug_mode_result
        .and_then(|(val,)| val.parse::<bool>().ok())
        .unwrap_or(false);

    // Only store request_messages if debug mode is enabled
    let messages_to_store = if debug_mode {
        request_messages
    } else {
        "" // Store empty string when debug mode is off
    };

    let response_ts = response_timestamp.unwrap_or("");
    let resp_text = response_text.unwrap_or("");
    let err_msg = error_message.unwrap_or("");
    let dur = duration_ms.unwrap_or(0);
    let prompt_tokens = usage.map(|u| u.prompt_tokens).unwrap_or(0);
    let completion_tokens = usage.map(|u| u.completion_tokens).unwrap_or(0);
    let total_tokens = usage.map(|u| u.total_tokens).unwrap_or(0);
    let created_at = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO api_call_logs (
            request_timestamp, response_timestamp, endpoint, model, request_type,
            request_messages, request_temperature, request_max_tokens,
            response_text, response_status, error_message, duration_ms,
            prompt_tokens, completion_tokens, total_tokens, screenshot_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(request_timestamp)
    .bind(response_ts)
    .bind(endpoint)
    .bind(model)
    .bind(request_type)
    .bind(messages_to_store)
    .bind(temperature)
    .bind(max_tokens as i32)
    .bind(resp_text)
    .bind(response_status)
    .bind(err_msg)
    .bind(dur)
    .bind(prompt_tokens)
    .bind(completion_tokens)
    .bind(total_tokens)
    .bind(screenshot_count)
    .bind(created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to insert API log: {}", e))?;

    pool.close().await;

    if debug_mode {
        log::info!("✅ API call logged to database with full request (type: {}, model: {}) [DEBUG MODE]", request_type, model);
    } else {
        log::info!("✅ API call logged to database (type: {}, model: {})", request_type, model);
    }

    Ok(())
}

/// Generate a daily summary from provided work entries
pub async fn generate_summary(entries: Vec<(String, String)>, date: &str, language: &str) -> Result<String, String> {
    // Load environment variables
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY not set in environment. Please configure your .env file.".to_string())?;

    let api_url = env::var("OPENAI_API_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    let model = env::var("OPENAI_MODEL")
        .unwrap_or_else(|_| "gpt-4o-mini".to_string());

    // Validate API key format
    if api_key == "sk-your-api-key-here" || api_key.is_empty() {
        return Err("Please set a valid OpenAI API key in the .env file.".to_string());
    }

    if entries.is_empty() {
        return Err(format!("No work entries found for {}.", date));
    }

    // Convert tuples to WorkEntry structs
    let work_entries: Vec<WorkEntry> = entries
        .into_iter()
        .map(|(description, timestamp)| WorkEntry {
            description,
            timestamp,
        })
        .collect();

    // Build the prompt
    let user_message = build_user_prompt(&work_entries, date);

    // Create the API request
    let request = OpenAIRequest {
        model: model.clone(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: MessageContent::Text(build_system_prompt(language)),
            },
            Message {
                role: "user".to_string(),
                content: MessageContent::Text(user_message),
            },
        ],
        temperature: 0.3,
        max_tokens: 200,
    };

    // Log request details
    let request_timestamp = Utc::now().to_rfc3339();
    let request_json = serde_json::to_string_pretty(&request.messages)
        .unwrap_or_else(|_| "Failed to serialize request".to_string());
    let endpoint = format!("{}/chat/completions", api_url);

    log::info!("📤 Sending API request - Type: daily_summary, Model: {}", model);

    // Start timing
    let start_time = std::time::Instant::now();

    // Call OpenAI API
    let client = reqwest::Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await;

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let response_timestamp = Utc::now().to_rfc3339();

    // Handle connection errors
    let response = match response {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to connect to OpenAI API: {}", e);
            log::error!("❌ API request failed: {}", error_msg);

            // Log failed request
            let _ = log_api_call(
                "worktape.db",
                &request_timestamp,
                Some(&response_timestamp),
                &endpoint,
                &model,
                "daily_summary",
                &request_json,
                0.7,
                500,
                None,
                "error",
                Some(&error_msg),
                Some(duration_ms),
                None,
                0,
            ).await;

            return Err(error_msg);
        }
    };

    // Check for HTTP errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        let error_msg = match status.as_u16() {
            401 => "Invalid API key. Please check your OPENAI_API_KEY in .env file.".to_string(),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("OpenAI API error ({}): {}", status, error_text),
        };

        log::error!("❌ API request failed with status {}: {}", status, error_msg);

        // Log failed request
        let _ = log_api_call(
            "worktape.db",
            &request_timestamp,
            Some(&response_timestamp),
            &endpoint,
            &model,
            "daily_summary",
            &request_json,
            0.7,
            500,
            None,
            &format!("http_error_{}", status.as_u16()),
            Some(&error_msg),
            Some(duration_ms),
            None,
            0,
        ).await;

        return Err(error_msg);
    }

    // Parse response
    let api_response: OpenAIResponse = match response.json().await {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to parse OpenAI response: {}", e);
            log::error!("❌ Failed to parse response: {}", error_msg);

            // Log parsing error
            let _ = log_api_call(
                "worktape.db",
                &request_timestamp,
                Some(&response_timestamp),
                &endpoint,
                &model,
                "daily_summary",
                &request_json,
                0.7,
                500,
                None,
                "parse_error",
                Some(&error_msg),
                Some(duration_ms),
                None,
                0,
            ).await;

            return Err(error_msg);
        }
    };

    // Extract summary text
    let summary_content = api_response
        .choices
        .first()
        .ok_or("No response generated from OpenAI")?
        .message
        .content
        .clone();

    // Extract text from MessageContent
    let summary = match summary_content {
        MessageContent::Text(t) => t,
        MessageContent::MultiModal(parts) => {
            // If multimodal response, extract text parts
            parts.into_iter()
                .filter_map(|part| match part {
                    ContentPart::Text { text } => Some(text),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    };

    log::info!("📥 Received API response - Duration: {}ms, Tokens: {:?}",
        duration_ms,
        api_response.usage.as_ref().map(|u| u.total_tokens)
    );

    // Log successful request
    let _ = log_api_call(
        "worktape.db",
        &request_timestamp,
        Some(&response_timestamp),
        &endpoint,
        &model,
        "daily_summary",
        &request_json,
        0.7,
        500,
        Some(&summary),
        "success",
        None,
        Some(duration_ms),
        api_response.usage.as_ref(),
        0,
    ).await;

    Ok(summary)
}

/// A group of work entries belonging to one task (or ungrouped)
pub struct TaskGroup {
    pub task_title: Option<String>,
    pub entries: Vec<WorkEntry>,
}

/// A labeled summary item returned to the frontend
#[derive(Debug, Serialize, Deserialize)]
pub struct SummaryItem {
    pub label: String,
    pub summary: String,
}

/// Generate labeled summary items: one per linked task, AI-clustered groups for unlinked entries.
/// Returns a JSON string: array of {label, summary}.
pub async fn generate_grouped_summary(
    task_groups: Vec<TaskGroup>,
    date: &str,
    language: &str,
) -> Result<String, String> {
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY not set in environment. Please configure your .env file.".to_string())?;

    let api_url = env::var("OPENAI_API_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    let model = env::var("OPENAI_MODEL")
        .unwrap_or_else(|_| "gpt-4o-mini".to_string());

    if api_key == "sk-your-api-key-here" || api_key.is_empty() {
        return Err("Please set a valid OpenAI API key in the .env file.".to_string());
    }

    if task_groups.is_empty() {
        return Err(format!("No work entries found for {}.", date));
    }

    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", api_url);
    let mut items: Vec<SummaryItem> = Vec::new();

    for group in &task_groups {
        if group.entries.is_empty() {
            continue;
        }

        match &group.task_title {
            Some(task_title) => {
                // Linked task: one call → one bullet, label is the task name
                let system_prompt = build_linked_task_system_prompt(language);
                let user_message = build_linked_task_user_prompt(task_title, &group.entries, date);

                let bullet = call_openai_single(
                    &client, &endpoint, &model, &api_key,
                    system_prompt, user_message, 120, language,
                ).await?;

                items.push(SummaryItem {
                    label: task_title.clone(),
                    summary: bullet,
                });
            }
            None => {
                // Unlinked entries: one call → AI clusters them and returns JSON array of {label, summary}
                let system_prompt = build_unlinked_system_prompt(language);
                let user_message = build_unlinked_user_prompt(&group.entries, date);

                let raw = call_openai_single(
                    &client, &endpoint, &model, &api_key,
                    system_prompt, user_message, 400, language,
                ).await?;

                // Parse the JSON array the AI returns
                let parsed: Vec<SummaryItem> = serde_json::from_str(&raw)
                    .map_err(|e| format!("Failed to parse unlinked summary JSON: {}. Raw: {}", e, raw))?;

                items.extend(parsed);
            }
        }
    }

    if items.is_empty() {
        return Err("No summary could be generated.".to_string());
    }

    serde_json::to_string(&items)
        .map_err(|e| format!("Failed to serialize summary items: {}", e))
}

/// Make a single OpenAI chat completion call and return the trimmed text response.
async fn call_openai_single(
    client: &reqwest::Client,
    endpoint: &str,
    model: &str,
    api_key: &str,
    system_prompt: String,
    user_message: String,
    max_tokens: u32,
    _language: &str,
) -> Result<String, String> {
    let request = OpenAIRequest {
        model: model.to_string(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: MessageContent::Text(system_prompt),
            },
            Message {
                role: "user".to_string(),
                content: MessageContent::Text(user_message),
            },
        ],
        temperature: 0.3,
        max_tokens,
    };

    let request_timestamp = Utc::now().to_rfc3339();
    let request_json = serde_json::to_string_pretty(&request.messages)
        .unwrap_or_else(|_| "Failed to serialize request".to_string());

    log::info!("📤 Sending grouped summary request");
    let start_time = std::time::Instant::now();

    let response = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await;

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let response_timestamp = Utc::now().to_rfc3339();

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to connect to OpenAI API: {}", e);
            log::error!("❌ API request failed: {}", error_msg);
            let _ = log_api_call(
                "worktape.db", &request_timestamp, Some(&response_timestamp),
                endpoint, model, "grouped_summary", &request_json,
                0.3, max_tokens, None, "error", Some(&error_msg), Some(duration_ms), None, 0,
            ).await;
            return Err(error_msg);
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        let error_msg = match status.as_u16() {
            401 => "Invalid API key. Please check your OPENAI_API_KEY in .env file.".to_string(),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("OpenAI API error ({}): {}", status, error_text),
        };
        return Err(error_msg);
    }

    let api_response: OpenAIResponse = response.json().await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

    let text = api_response.choices
        .into_iter()
        .next()
        .and_then(|c| match c.message.content {
            MessageContent::Text(t) => Some(t.trim().to_string()),
            _ => None,
        })
        .ok_or("No response from OpenAI")?;

    let _ = log_api_call(
        "worktape.db", &request_timestamp, Some(&response_timestamp),
        endpoint, model, "grouped_summary", &request_json,
        0.3, max_tokens, Some(&text), "success", None, Some(duration_ms),
        api_response.usage.as_ref(), 0,
    ).await;

    Ok(text)
}

fn build_linked_task_system_prompt(language_code: &str) -> String {
    format!(
        "You will receive work log entries for a single named task. \
Write exactly one concise sentence (no leading dash, no bullet) summarizing what was done. \
Be brief and factual — this is a personal reminder, not a report. \
{}",
        language_instruction(language_code)
    )
}

fn build_linked_task_user_prompt(task_title: &str, entries: &[WorkEntry], date: &str) -> String {
    let mut prompt = format!("Task: {}\nWork entries for {} ({} total):\n\n", task_title, date, entries.len());
    for entry in entries {
        let time = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&entry.timestamp) {
            dt.format("%I:%M %p").to_string()
        } else {
            entry.timestamp.clone()
        };
        prompt.push_str(&format!("{}: {}\n", time, entry.description));
    }
    prompt
}

fn build_unlinked_system_prompt(language_code: &str) -> String {
    format!(
        "You will receive work log entries that are not linked to any specific task. \
Group them by topic and return a JSON array. Each element must have:\
- \"label\": a short (2-5 word) topic label\
- \"summary\": one concise sentence describing what was done\
Return only the JSON array, no other text. Example: \
[{{\"label\":\"Code review\",\"summary\":\"Reviewed pull requests for the auth module.\"}},\
{{\"label\":\"Meetings\",\"summary\":\"Attended standup and planning session.\"}}]\
{}",
        language_instruction(language_code)
    )
}

fn build_unlinked_user_prompt(entries: &[WorkEntry], date: &str) -> String {
    let mut prompt = format!("Unlinked work entries for {} ({} total):\n\n", date, entries.len());
    for entry in entries {
        let time = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&entry.timestamp) {
            dt.format("%I:%M %p").to_string()
        } else {
            entry.timestamp.clone()
        };
        prompt.push_str(&format!("{}: {}\n", time, entry.description));
    }
    prompt
}

/// Build the user prompt from work entries
pub(crate) fn build_user_prompt(entries: &[WorkEntry], date: &str) -> String {
    let mut prompt = format!("Work entries for {} ({} total):\n\n", date, entries.len());

    for entry in entries {
        // Parse timestamp and format time
        let time = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&entry.timestamp) {
            dt.format("%I:%M %p").to_string()
        } else {
            entry.timestamp.clone()
        };

        prompt.push_str(&format!("{}: {}\n", time, entry.description));
    }

    prompt
}

/// Analyze screenshots using GPT-4o vision model
pub async fn analyze_screenshots(screenshots_base64: Vec<String>) -> Result<String, String> {
    // Load environment variables
    let api_key = env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY not set in environment. Please configure your .env file.".to_string())?;

    let api_url = env::var("OPENAI_API_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    // Use GPT-4o for vision analysis (not mini)
    let model = "gpt-4o".to_string();

    // Validate API key format
    if api_key == "sk-your-api-key-here" || api_key.is_empty() {
        return Err("Please set a valid OpenAI API key in the .env file.".to_string());
    }

    if screenshots_base64.is_empty() {
        return Err("No screenshots provided for analysis.".to_string());
    }

    // Build content parts: text prompt + images
    let mut content_parts = vec![
        ContentPart::Text {
            text: "Analyze these screenshots from a user's workspace. Describe what work activity is being performed. Focus on: applications being used, specific tasks or files visible, and infer the type of work. If there are multiple monitors, combine insights from all monitors into a single coherent description. Be specific and concise.".to_string(),
        }
    ];

    let screenshot_count = screenshots_base64.len() as i32;

    // Add all screenshots as image parts
    for base64_data in screenshots_base64 {
        content_parts.push(ContentPart::ImageUrl {
            image_url: ImageUrl {
                url: format!("data:image/jpeg;base64,{}", base64_data),
            },
        });
    }

    // Create the API request
    let request = OpenAIRequest {
        model: model.clone(),
        messages: vec![
            Message {
                role: "user".to_string(),
                content: MessageContent::MultiModal(content_parts.clone()),
            },
        ],
        temperature: 0.7,
        max_tokens: 500,
    };

    // Log request details
    let request_timestamp = Utc::now().to_rfc3339();

    // Serialize full request with images for debug mode
    let full_request_json = serde_json::to_string(&request.messages)
        .unwrap_or_else(|_| "Failed to serialize request".to_string());

    let endpoint = format!("{}/chat/completions", api_url);

    log::info!("📤 Sending API request - Type: screenshot_analysis, Model: {}, Screenshots: {}", model, screenshot_count);

    // Start timing
    let start_time = std::time::Instant::now();

    // Call OpenAI API
    let client = reqwest::Client::new();
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await;

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let response_timestamp = Utc::now().to_rfc3339();

    // Handle connection errors
    let response = match response {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to connect to OpenAI API: {}", e);
            log::error!("❌ API request failed: {}", error_msg);

            // Log failed request
            let _ = log_api_call(
                "worktape.db",
                &request_timestamp,
                Some(&response_timestamp),
                &endpoint,
                &model,
                "screenshot_analysis",
                &full_request_json,
                0.7,
                500,
                None,
                "error",
                Some(&error_msg),
                Some(duration_ms),
                None,
                screenshot_count,
            ).await;

            return Err(error_msg);
        }
    };

    // Check for HTTP errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        let error_msg = match status.as_u16() {
            401 => "Invalid API key. Please check your OPENAI_API_KEY in .env file.".to_string(),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("OpenAI API error ({}): {}", status, error_text),
        };

        log::error!("❌ API request failed with status {}: {}", status, error_msg);

        // Log failed request
        let _ = log_api_call(
            "worktape.db",
            &request_timestamp,
            Some(&response_timestamp),
            &endpoint,
            &model,
            "screenshot_analysis",
            &full_request_json,
            0.7,
            500,
            None,
            &format!("http_error_{}", status.as_u16()),
            Some(&error_msg),
            Some(duration_ms),
            None,
            screenshot_count,
        ).await;

        return Err(error_msg);
    }

    // Parse response
    let api_response: OpenAIResponse = match response.json().await {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to parse OpenAI response: {}", e);
            log::error!("❌ Failed to parse response: {}", error_msg);

            // Log parsing error
            let _ = log_api_call(
                "worktape.db",
                &request_timestamp,
                Some(&response_timestamp),
                &endpoint,
                &model,
                "screenshot_analysis",
                &full_request_json,
                0.7,
                500,
                None,
                "parse_error",
                Some(&error_msg),
                Some(duration_ms),
                None,
                screenshot_count,
            ).await;

            return Err(error_msg);
        }
    };

    // Extract analysis text
    let analysis = api_response
        .choices
        .first()
        .ok_or("No response generated from OpenAI")?
        .message
        .content
        .clone();

    // Extract text from MessageContent
    let text = match analysis {
        MessageContent::Text(t) => t,
        MessageContent::MultiModal(parts) => {
            // If multimodal response, extract text parts
            parts.into_iter()
                .filter_map(|part| match part {
                    ContentPart::Text { text } => Some(text),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    };

    log::info!("📥 Received API response - Duration: {}ms, Tokens: {:?}, Screenshots: {}",
        duration_ms,
        api_response.usage.as_ref().map(|u| u.total_tokens),
        screenshot_count
    );

    // Log successful request
    let _ = log_api_call(
        "worktape.db",
        &request_timestamp,
        Some(&response_timestamp),
        &endpoint,
        &model,
        "screenshot_analysis",
        &full_request_json,
        0.7,
        500,
        Some(&text),
        "success",
        None,
        Some(duration_ms),
        api_response.usage.as_ref(),
        screenshot_count,
    ).await;

    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_instruction_english() {
        let result = language_instruction("en");
        assert!(result.contains("English"), "Expected English instruction, got: {}", result);
    }

    #[test]
    fn language_instruction_dutch() {
        let result = language_instruction("nl");
        assert!(result.contains("Dutch"), "Expected Dutch instruction, got: {}", result);
    }

    #[test]
    fn language_instruction_unknown_falls_back_to_english() {
        let result = language_instruction("zz");
        assert!(result.contains("English"), "Expected fallback to English for unknown code, got: {}", result);
    }

    #[test]
    fn build_system_prompt_contains_language_instruction() {
        let prompt = build_system_prompt("nl");
        assert!(prompt.contains("Dutch"), "System prompt should contain Dutch instruction");

        let prompt_en = build_system_prompt("en");
        assert!(prompt_en.contains("English"), "System prompt should contain English instruction");
    }

    #[test]
    fn build_user_prompt_formats_entries() {
        let entries = vec![
            WorkEntry {
                description: "Fixed login bug".to_string(),
                timestamp: "2026-03-11T09:00:00+00:00".to_string(),
            },
            WorkEntry {
                description: "Wrote unit tests".to_string(),
                timestamp: "2026-03-11T11:30:00+00:00".to_string(),
            },
        ];
        let prompt = build_user_prompt(&entries, "2026-03-11");
        assert!(prompt.contains("2026-03-11"), "Should contain the date");
        assert!(prompt.contains("2 total"), "Should contain total entry count");
        assert!(prompt.contains("Fixed login bug"), "Should contain first description");
        assert!(prompt.contains("Wrote unit tests"), "Should contain second description");
    }

    #[test]
    fn build_user_prompt_empty_entries() {
        let entries: Vec<WorkEntry> = vec![];
        let prompt = build_user_prompt(&entries, "2026-03-11");
        // Should not panic and should at least contain the date header
        assert!(prompt.contains("2026-03-11"));
    }
}
