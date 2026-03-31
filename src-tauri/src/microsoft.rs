use serde::{Deserialize, Serialize};
use chrono::Utc;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// A calendar event from Microsoft Graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub subject: String,
    pub start_time: String,
    pub end_time: String,
    pub duration_minutes: i32,
    pub description: String,
    pub is_all_day: bool,
}

/// Microsoft OAuth token response
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

/// Microsoft Graph calendarView response
#[derive(Debug, Deserialize)]
struct CalendarViewResponse {
    value: Vec<GraphEvent>,
}

#[derive(Debug, Deserialize)]
struct GraphEvent {
    subject: Option<String>,
    start: Option<GraphDateTime>,
    end: Option<GraphDateTime>,
    #[serde(rename = "bodyPreview")]
    body_preview: Option<String>,
    #[serde(rename = "isAllDay")]
    is_all_day: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct GraphDateTime {
    #[serde(rename = "dateTime")]
    date_time: String,
    #[serde(rename = "timeZone")]
    _time_zone: Option<String>,
}

const AUTHORIZE_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_CALENDAR_VIEW_URL: &str = "https://graph.microsoft.com/v1.0/me/calendarView";
const GRAPH_ME_URL: &str = "https://graph.microsoft.com/v1.0/me";

/// Generate a random string for PKCE and state
fn random_string(len: usize) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut result = String::with_capacity(len);
    let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    // Seed from multiple entropy sources
    let mut hasher = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut hasher);
    std::thread::current().id().hash(&mut hasher);
    let mut seed = hasher.finish();

    for _ in 0..len {
        // Simple PRNG (xorshift)
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        result.push(chars[(seed as usize) % chars.len()] as char);
    }
    result
}

/// Generate PKCE code_verifier and code_challenge (S256)
fn generate_pkce() -> (String, String) {
    let verifier = random_string(64);

    // SHA-256 hash the verifier for the challenge
    // Using a simple SHA-256 implementation to avoid adding a dependency
    let challenge = base64_url_encode(&sha256(verifier.as_bytes()));

    (verifier, challenge)
}

/// Base64 URL-safe encoding without padding (RFC 7636)
fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Minimal SHA-256 implementation for PKCE
fn sha256(data: &[u8]) -> [u8; 32] {
    // SHA-256 constants
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    // Pre-processing: padding
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    // Process each 512-bit block
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g; g = f; f = e; e = d.wrapping_add(temp1);
            d = c; c = b; b = a; a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut result = [0u8; 32];
    for (i, val) in h.iter().enumerate() {
        result[i * 4..i * 4 + 4].copy_from_slice(&val.to_be_bytes());
    }
    result
}

/// Start the Microsoft OAuth flow.
/// Opens the system browser and starts a local callback server.
/// Returns the account email on success.
pub async fn start_auth_flow(
    client_id: &str,
    pool: &sqlx::SqlitePool,
) -> Result<String, String> {
    let (code_verifier, code_challenge) = generate_pkce();
    let state = random_string(32);

    // Bind to a random available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start local server: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();

    let redirect_uri = format!("http://localhost:{}/callback", port);

    // Build authorization URL
    let auth_url = format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        AUTHORIZE_URL,
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode("Calendars.Read offline_access"),
        urlencoding::encode(&code_challenge),
        urlencoding::encode(&state),
    );

    // Open the system browser
    opener::open(&auth_url)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for the callback (with timeout)
    let auth_code = wait_for_callback(&listener, &state).await?;

    // Exchange auth code for tokens
    let tokens = exchange_code_for_tokens(client_id, &auth_code, &redirect_uri, &code_verifier).await?;

    // Calculate expiry
    let expires_at = Utc::now() + chrono::Duration::seconds(tokens.expires_in);

    // Store tokens
    store_setting(pool, "ms_access_token", &tokens.access_token).await?;
    if let Some(ref rt) = tokens.refresh_token {
        store_setting(pool, "ms_refresh_token", rt).await?;
    }
    store_setting(pool, "ms_token_expires_at", &expires_at.to_rfc3339()).await?;

    // Fetch and store the user's email
    let email = fetch_user_email(&tokens.access_token).await.unwrap_or_default();
    store_setting(pool, "ms_account_email", &email).await?;

    Ok(email)
}

/// Wait for the OAuth callback on the local server
async fn wait_for_callback(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
    // Timeout after 5 minutes
    let timeout = tokio::time::timeout(std::time::Duration::from_secs(300), async {
        loop {
            let (mut stream, _) = listener.accept()
                .await
                .map_err(|e| format!("Failed to accept connection: {}", e))?;

            let mut buf = vec![0u8; 4096];
            let n = stream.read(&mut buf)
                .await
                .map_err(|e| format!("Failed to read request: {}", e))?;
            let request = String::from_utf8_lossy(&buf[..n]);

            // Parse the GET request for the callback
            if let Some(path_line) = request.lines().next() {
                if let Some(path) = path_line.split_whitespace().nth(1) {
                    if path.starts_with("/callback") {
                        // Parse query parameters
                        let query = path.split('?').nth(1).unwrap_or("");
                        let params: std::collections::HashMap<&str, &str> = query
                            .split('&')
                            .filter_map(|p| {
                                let mut parts = p.splitn(2, '=');
                                Some((parts.next()?, parts.next()?))
                            })
                            .collect();

                        // Check for errors
                        if let Some(error) = params.get("error") {
                            let desc = params.get("error_description").unwrap_or(&"Unknown error");
                            let error_html = format!(
                                "<html><body><h1>Authentication Failed</h1><p>{}: {}</p><p>You can close this window.</p></body></html>",
                                error, desc
                            );
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                error_html.len(), error_html
                            );
                            let _ = stream.write_all(response.as_bytes()).await;
                            return Err(format!("OAuth error: {}: {}", error, desc));
                        }

                        // Verify state
                        if let Some(returned_state) = params.get("state") {
                            if *returned_state != expected_state {
                                let error_html = "<html><body><h1>Authentication Failed</h1><p>State mismatch. Please try again.</p></body></html>";
                                let response = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    error_html.len(), error_html
                                );
                                let _ = stream.write_all(response.as_bytes()).await;
                                return Err("OAuth state mismatch".to_string());
                            }
                        }

                        // Extract authorization code
                        if let Some(code) = params.get("code") {
                            let success_html = "<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to WorkTape.</p></body></html>";
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                success_html.len(), success_html
                            );
                            let _ = stream.write_all(response.as_bytes()).await;
                            return Ok(code.to_string());
                        }
                    }
                }
            }

            // Not the callback request, send a simple response
            let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(not_found.as_bytes()).await;
        }
    });

    timeout.await.map_err(|_| "Authentication timed out after 5 minutes. Please try again.".to_string())?
}

/// Exchange authorization code for tokens
async fn exchange_code_for_tokens(
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<TokenResponse, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
    ];

    let resp = client.post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed ({}): {}", status, body));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))
}

/// Refresh the access token if it's about to expire (within 5 minutes)
pub async fn refresh_token_if_needed(
    client_id: &str,
    pool: &sqlx::SqlitePool,
) -> Result<Option<String>, String> {
    let expires_at = get_setting(pool, "ms_token_expires_at").await?;
    let refresh_token = get_setting(pool, "ms_refresh_token").await?;

    let (expires_at, refresh_token) = match (expires_at, refresh_token) {
        (Some(e), Some(r)) => (e, r),
        _ => return Ok(None), // Not connected
    };

    let expires = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map_err(|e| format!("Failed to parse token expiry: {}", e))?;

    let now = Utc::now();
    let five_min = chrono::Duration::minutes(5);

    if expires.signed_duration_since(now) > five_min {
        // Token is still valid
        let access_token = get_setting(pool, "ms_access_token").await?;
        return Ok(access_token);
    }

    // Refresh the token
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("client_id", client_id),
        ("scope", "Calendars.Read offline_access"),
    ];

    let resp = client.post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !resp.status().is_success() {
        // Refresh failed - clear tokens and return error
        clear_tokens(pool).await?;
        return Err("Token refresh failed. Please reconnect your calendar.".to_string());
    }

    let tokens: TokenResponse = resp.json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    let new_expires = Utc::now() + chrono::Duration::seconds(tokens.expires_in);

    store_setting(pool, "ms_access_token", &tokens.access_token).await?;
    if let Some(ref rt) = tokens.refresh_token {
        store_setting(pool, "ms_refresh_token", rt).await?;
    }
    store_setting(pool, "ms_token_expires_at", &new_expires.to_rfc3339()).await?;

    Ok(Some(tokens.access_token))
}

/// Fetch calendar events for a given date
pub async fn fetch_calendar_events(
    access_token: &str,
    date: &str,
) -> Result<Vec<CalendarEvent>, String> {
    let client = reqwest::Client::new();

    let start = format!("{}T00:00:00", date);
    let end = format!("{}T23:59:59", date);

    let resp = client.get(GRAPH_CALENDAR_VIEW_URL)
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&[
            ("startDateTime", start.as_str()),
            ("endDateTime", end.as_str()),
            ("$select", "subject,start,end,bodyPreview,isAllDay"),
            ("$orderby", "start/dateTime"),
            ("$top", "50"),
        ])
        .send()
        .await
        .map_err(|e| format!("Calendar fetch failed: {}", e))?;

    if resp.status().as_u16() == 401 {
        return Err("CALENDAR_UNAUTHORIZED".to_string());
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Calendar API error ({}): {}", status, body));
    }

    let calendar_resp: CalendarViewResponse = resp.json()
        .await
        .map_err(|e| format!("Failed to parse calendar response: {}", e))?;

    let events: Vec<CalendarEvent> = calendar_resp.value.into_iter().map(|ev| {
        let subject = ev.subject.unwrap_or_default();
        let is_all_day = ev.is_all_day.unwrap_or(false);
        let description = ev.body_preview.unwrap_or_default().chars().take(200).collect();

        let start_time = ev.start.as_ref().map(|s| s.date_time.clone()).unwrap_or_default();
        let end_time = ev.end.as_ref().map(|e| e.date_time.clone()).unwrap_or_default();

        // Calculate duration in minutes
        let duration_minutes = if let (Some(start), Some(end)) = (&ev.start, &ev.end) {
            if let (Ok(s), Ok(e)) = (
                chrono::NaiveDateTime::parse_from_str(&start.date_time, "%Y-%m-%dT%H:%M:%S%.f"),
                chrono::NaiveDateTime::parse_from_str(&end.date_time, "%Y-%m-%dT%H:%M:%S%.f"),
            ) {
                (e - s).num_minutes() as i32
            } else {
                0
            }
        } else {
            0
        };

        CalendarEvent {
            subject,
            start_time,
            end_time,
            duration_minutes,
            description,
            is_all_day,
        }
    }).collect();

    Ok(events)
}

/// Get the current auth status
pub async fn get_auth_status(pool: &sqlx::SqlitePool) -> Result<String, String> {
    let access_token = get_setting(pool, "ms_access_token").await?;
    let expires_at = get_setting(pool, "ms_token_expires_at").await?;
    let refresh_token = get_setting(pool, "ms_refresh_token").await?;

    match (access_token, refresh_token) {
        (Some(_), Some(_)) => {
            if let Some(expires) = expires_at {
                if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&expires) {
                    if exp < Utc::now() {
                        // Token expired but refresh token exists - can try to refresh
                        return Ok("expired".to_string());
                    }
                }
            }
            Ok("connected".to_string())
        }
        _ => Ok("disconnected".to_string()),
    }
}

/// Get the stored account email
pub async fn get_account_email(pool: &sqlx::SqlitePool) -> Result<Option<String>, String> {
    get_setting(pool, "ms_account_email").await
}

/// Clear all Microsoft tokens (disconnect)
pub async fn disconnect(pool: &sqlx::SqlitePool) -> Result<(), String> {
    clear_tokens(pool).await
}

/// Format calendar events for inclusion in AI prompt
pub fn format_events_for_prompt(events: &[CalendarEvent]) -> String {
    events.iter().map(|ev| {
        if ev.is_all_day {
            if ev.description.is_empty() {
                format!("- {} (all day)", ev.subject)
            } else {
                format!("- {} (all day): {}", ev.subject, ev.description)
            }
        } else {
            // Format start/end times nicely
            let start = format_time(&ev.start_time);
            let end = format_time(&ev.end_time);
            if ev.description.is_empty() {
                format!("- {} ({} - {}, {} min)", ev.subject, start, end, ev.duration_minutes)
            } else {
                format!("- {} ({} - {}, {} min): {}", ev.subject, start, end, ev.duration_minutes, ev.description)
            }
        }
    }).collect::<Vec<_>>().join("\n")
}

fn format_time(iso_time: &str) -> String {
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(iso_time, "%Y-%m-%dT%H:%M:%S%.f") {
        dt.format("%H:%M").to_string()
    } else {
        iso_time.to_string()
    }
}

/// Fetch the user's email from Microsoft Graph /me endpoint
async fn fetch_user_email(access_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.get(GRAPH_ME_URL)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user profile: {}", e))?;

    if !resp.status().is_success() {
        return Err("Failed to fetch user profile".to_string());
    }

    #[derive(Deserialize)]
    struct MeResponse {
        #[serde(rename = "userPrincipalName")]
        user_principal_name: Option<String>,
        mail: Option<String>,
    }

    let me: MeResponse = resp.json()
        .await
        .map_err(|e| format!("Failed to parse user profile: {}", e))?;

    Ok(me.mail.or(me.user_principal_name).unwrap_or_default())
}

// ─── Settings helpers ───────────────────────────────────────────────────────

async fn get_setting(pool: &sqlx::SqlitePool, key: &str) -> Result<Option<String>, String> {
    let row = sqlx::query_as::<_, (String,)>(
        "SELECT value FROM settings WHERE key = ?"
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("DB error reading {}: {}", key, e))?;

    Ok(row.map(|(v,)| v).filter(|v| !v.is_empty()))
}

async fn store_setting(pool: &sqlx::SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| format!("DB error storing {}: {}", key, e))?;
    Ok(())
}

async fn clear_tokens(pool: &sqlx::SqlitePool) -> Result<(), String> {
    for key in &["ms_access_token", "ms_refresh_token", "ms_token_expires_at", "ms_account_email"] {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(pool)
            .await
            .map_err(|e| format!("DB error clearing {}: {}", key, e))?;
    }
    Ok(())
}

/// URL-encode a string (percent encoding)
mod urlencoding {
    pub fn encode(input: &str) -> String {
        let mut result = String::with_capacity(input.len() * 3);
        for byte in input.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(byte as char);
                }
                _ => {
                    result.push_str(&format!("%{:02X}", byte));
                }
            }
        }
        result
    }
}

/// Open a URL in the system browser
mod opener {
    pub fn open(url: &str) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", url])
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }
        Ok(())
    }
}
