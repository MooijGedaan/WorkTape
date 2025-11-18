use serde::{Deserialize, Serialize};
use std::env;

// System prompt for AI summary generation
const SYSTEM_PROMPT: &str = "Create an overview of the users work of this day. \
Estimate the time the user has spend on each task and provide a short description (1 sentence).
Group tasks together and provide a good / understandable description that summarizes the work.
The result should not have any md formatting, just plain text.";

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum MessageContent {
    Text(String),
    MultiModal(Vec<ContentPart>),
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ImageUrl {
    url: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Debug)]
struct WorkEntry {
    description: String,
    timestamp: String,
}

/// Generate a daily summary from provided work entries
pub async fn generate_summary(entries: Vec<(String, String)>, date: &str) -> Result<String, String> {
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
        model,
        messages: vec![
            Message {
                role: "system".to_string(),
                content: MessageContent::Text(SYSTEM_PROMPT.to_string()),
            },
            Message {
                role: "user".to_string(),
                content: MessageContent::Text(user_message),
            },
        ],
        temperature: 0.7,
        max_tokens: 500,
    };

    // Call OpenAI API
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/chat/completions", api_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OpenAI API: {}", e))?;

    // Check for HTTP errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        return Err(match status.as_u16() {
            401 => "Invalid API key. Please check your OPENAI_API_KEY in .env file.".to_string(),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("OpenAI API error ({}): {}", status, error_text),
        });
    }

    // Parse response
    let api_response: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

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

    Ok(summary)
}

/// Build the user prompt from work entries
fn build_user_prompt(entries: &[WorkEntry], date: &str) -> String {
    let mut prompt = format!("Work entries for {}:\n\n", date);

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
        model,
        messages: vec![
            Message {
                role: "user".to_string(),
                content: MessageContent::MultiModal(content_parts),
            },
        ],
        temperature: 0.7,
        max_tokens: 500,
    };

    // Call OpenAI API
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/chat/completions", api_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OpenAI API: {}", e))?;

    // Check for HTTP errors
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();

        return Err(match status.as_u16() {
            401 => "Invalid API key. Please check your OPENAI_API_KEY in .env file.".to_string(),
            429 => "Rate limit exceeded. Please try again in a moment.".to_string(),
            _ => format!("OpenAI API error ({}): {}", status, error_text),
        });
    }

    // Parse response
    let api_response: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

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

    Ok(text)
}
