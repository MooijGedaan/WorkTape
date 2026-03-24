use serde::{Deserialize, Serialize};
use chrono::Utc;

pub(crate) const PROXY_URL: &str = "https://worktape-proxy.daanmooij-385.workers.dev/v1";

pub(crate) fn language_instruction(language_code: &str) -> &'static str {
    match language_code {
        "nl" => "Respond entirely in Dutch.",
        _    => "Respond entirely in English.",
    }
}

#[derive(Debug, Serialize)]
pub struct OpenAIRequest {
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

#[derive(Debug, Clone)]
pub(crate) struct WorkEntry {
    pub(crate) description: String,
    pub(crate) timestamp: String,
}

#[derive(Debug, Clone)]
pub struct TaskGroup {
    pub task_title: Option<String>,
    pub task_id: Option<i64>,
    /// Pre-looked-up canonical label for this task+language; if Some, skip AI label generation.
    pub cached_label: Option<String>,
    pub entries: Vec<WorkEntry>,
}

/// A labeled summary item returned to the frontend
#[derive(Debug, Serialize, Deserialize)]
pub struct SummaryItem {
    pub label: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<i64>,
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

    let messages_to_store = if debug_mode { request_messages } else { "" };

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

/// A generated label paired with the task_id that produced it, for persistence.
pub struct NewTaskLabel {
    pub task_id: i64,
    pub label: String,
}

/// Generate labeled summary items: one per linked task, AI-clustered groups for unlinked entries.
/// Returns (JSON string: array of {label, summary}, new labels to persist).
pub async fn generate_grouped_summary(
    task_groups: Vec<TaskGroup>,
    date: &str,
    language: &str,
    device_token: &str,
) -> Result<(String, Vec<NewTaskLabel>), String> {
    if task_groups.is_empty() {
        return Err(format!("No work entries found for {}.", date));
    }

    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", PROXY_URL);
    let mut items: Vec<SummaryItem> = Vec::new();
    let mut new_labels: Vec<NewTaskLabel> = Vec::new();

    for group in &task_groups {
        if group.entries.is_empty() {
            continue;
        }

        match &group.task_title {
            Some(task_title) => {
                if let Some(cached_label) = &group.cached_label {
                    // Label already known — only ask AI for the summary sentence
                    let system_prompt = build_linked_task_summary_only_prompt(language);
                    let user_message = build_linked_task_user_prompt(task_title, &group.entries, date);

                    let summary = call_openai_single(
                        &client, &endpoint,
                        system_prompt, user_message, 120, language, device_token,
                    ).await?;

                    items.push(SummaryItem {
                        label: cached_label.clone(),
                        summary,
                        task_id: group.task_id,
                    });
                } else {
                    // No cached label — ask AI for {label, summary} and remember the new label
                    let system_prompt = build_linked_task_system_prompt(language);
                    let user_message = build_linked_task_user_prompt(task_title, &group.entries, date);

                    let raw = call_openai_single(
                        &client, &endpoint,
                        system_prompt, user_message, 150, language, device_token,
                    ).await?;

                    let mut parsed: SummaryItem = serde_json::from_str(&raw)
                        .unwrap_or_else(|_| SummaryItem {
                            label: task_title.clone(),
                            summary: raw,
                            task_id: None,
                        });
                    parsed.task_id = group.task_id;

                    if let Some(task_id) = group.task_id {
                        new_labels.push(NewTaskLabel { task_id, label: parsed.label.clone() });
                    }

                    items.push(parsed);
                }
            }
            None => {
                // Unlinked entries: one call → AI clusters them and returns JSON array of {label, summary}
                let system_prompt = build_unlinked_system_prompt(language);
                let user_message = build_unlinked_user_prompt(&group.entries, date);

                let raw = call_openai_single(
                    &client, &endpoint,
                    system_prompt, user_message, 400, language, device_token,
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

    let json = serde_json::to_string(&items)
        .map_err(|e| format!("Failed to serialize summary items: {}", e))?;

    Ok((json, new_labels))
}

/// Make a single chat completion call via the proxy and return the trimmed text response.
/// Make a single chat completion call via the proxy and return the trimmed text response.
async fn call_openai_single(
    client: &reqwest::Client,
    endpoint: &str,
    system_prompt: String,
    user_message: String,
    max_tokens: u32,
    _language: &str,
    device_token: &str,
) -> Result<String, String> {
    let request = OpenAIRequest {
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
        .header("X-Device-Token", device_token)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await;

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let response_timestamp = Utc::now().to_rfc3339();

    let response = match response {
        Ok(r) => r,
        Err(e) => {
            let error_msg = format!("Failed to connect to summary service: {}", e);
            let error_msg = format!("Failed to connect to summary service: {}", e);
            log::error!("❌ API request failed: {}", error_msg);
            let _ = log_api_call(
                "worktape.db", &request_timestamp, Some(&response_timestamp),
                endpoint, "worker-assigned", "grouped_summary", &request_json,
                0.3, max_tokens, None, "error", Some(&error_msg), Some(duration_ms), None, 0,
            ).await;
            return Err(error_msg);
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        let error_msg = match status.as_u16() {
            401 => return Err("TOKEN_REVOKED".to_string()),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("Summary service error ({}): {}", status, error_text),
            _ => format!("Summary service error ({}): {}", status, error_text),
        };
        return Err(error_msg);
    }

    let api_response: OpenAIResponse = response.json().await
        .map_err(|e| format!("Failed to parse summary response: {}", e))?;

    let text = api_response.choices
        .into_iter()
        .next()
        .and_then(|c| match c.message.content {
            MessageContent::Text(t) => Some(t.trim().to_string()),
            _ => None,
        })
        .ok_or("No response from summary service")?;

    let _ = log_api_call(
        "worktape.db", &request_timestamp, Some(&response_timestamp),
        endpoint, "worker-assigned", "grouped_summary", &request_json,
        0.3, max_tokens, Some(&text), "success", None, Some(duration_ms),
        api_response.usage.as_ref(), 0,
    ).await;

    Ok(text)
}

fn build_linked_task_system_prompt(language_code: &str) -> String {
    format!(
        "You will receive work log entries for a single named task. \
Return a JSON object with exactly two fields:\
- \"label\": a very short (2-4 words max) version of the task name, suitable as a quick memory aid. Translate it to the response language.\
- \"summary\": one concise sentence summarizing what was done. No leading dash or bullet.\
Return only the JSON object, no other text. Example: \
{{\"label\":\"Auth refactor\",\"summary\":\"Refactored login flow to use JWT tokens.\"}}\
{}",
        language_instruction(language_code)
    )
}

fn build_linked_task_summary_only_prompt(language_code: &str) -> String {
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
