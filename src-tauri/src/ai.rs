//! DeepSeek API 接入。
//!
//! 设计要点：API Key 只保存在系统凭据管理器（Windows Credential Manager），
//! 请求也全部在 Rust 侧发出，前端永远拿不到密钥；前端只负责构造 prompt 与解析结果。

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const SERVICE: &str = "com.memobook.desktop";
const ACCOUNT: &str = "deepseek-api-key";
const ENDPOINT: &str = "https://api.deepseek.com/chat/completions";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("无法访问系统凭据管理器：{e}"))
}

fn load_key() -> Result<String, String> {
    let item = entry()?;
    match item.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        Ok(_) => Err("API Key 为空，请重新填写".into()),
        Err(keyring::Error::NoEntry) => Err("尚未配置 DeepSeek API Key".into()),
        Err(e) => Err(format!("读取 API Key 失败：{e}")),
    }
}

/// Key 的配置状态（只回传前 6 位用于辨认，绝不回传完整密钥）
#[derive(Serialize)]
pub struct KeyStatus {
    pub configured: bool,
    pub hint: String,
}

#[tauri::command]
pub fn ai_key_status() -> KeyStatus {
    match load_key() {
        Ok(key) => {
            let hint = if key.chars().count() > 6 {
                format!("{}…（共 {} 位）", key.chars().take(6).collect::<String>(), key.chars().count())
            } else {
                "已配置".to_string()
            };
            KeyStatus { configured: true, hint }
        }
        Err(_) => KeyStatus { configured: false, hint: String::new() },
    }
}

#[tauri::command]
pub fn ai_set_key(key: String) -> Result<KeyStatus, String> {
    let trimmed = key.trim().to_string();
    if trimmed.len() < 8 {
        return Err("API Key 看起来不完整".into());
    }
    entry()?.set_password(&trimmed).map_err(|e| format!("写入凭据管理器失败：{e}"))?;
    Ok(ai_key_status())
}

#[tauri::command]
pub fn ai_clear_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("删除凭据失败：{e}")),
    }
}

#[derive(Deserialize)]
pub struct AiChatRequest {
    pub model: String,
    pub messages: Vec<serde_json::Value>,
    pub max_tokens: u32,
    #[serde(default)]
    pub temperature: Option<f32>,
}

#[derive(Serialize)]
pub struct AiChatResponse {
    pub content: String,
    pub model: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    /// 命中磁盘缓存的输入 token 数（用于展示省钱效果）
    pub cache_hit_tokens: u64,
}

/// 转发一次对话补全请求；强制 JSON 输出，避免前端随意改造成通用代理
#[tauri::command]
pub async fn ai_chat(request: AiChatRequest) -> Result<AiChatResponse, String> {
    let key = load_key()?;

    let body = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "response_format": { "type": "json_object" },
        "max_tokens": request.max_tokens,
        "temperature": request.temperature.unwrap_or(0.2),
        "stream": false,
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))?;

    let response = client
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "请求超时（120 秒）：网络不稳定或会议文本过长".to_string()
            } else {
                format!("网络请求失败：{e}")
            }
        })?;

    let status = response.status();
    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("响应不是合法 JSON：{e}"))?;

    if !status.is_success() {
        let message = payload
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        let friendly = match status.as_u16() {
            401 => "API Key 无效或已过期".to_string(),
            402 => "DeepSeek 账户余额不足".to_string(),
            429 => "请求过于频繁，请稍后再试".to_string(),
            500..=599 => format!("DeepSeek 服务端错误（{status}）"),
            _ => format!("请求失败（{status}）：{message}"),
        };
        return Err(friendly);
    }

    let content = payload
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    let usage = payload.get("usage").cloned().unwrap_or(serde_json::json!({}));
    let pick = |key: &str| usage.get(key).and_then(|v| v.as_u64()).unwrap_or(0);

    Ok(AiChatResponse {
        content,
        model: payload
            .get("model")
            .and_then(|m| m.as_str())
            .unwrap_or(&request.model)
            .to_string(),
        prompt_tokens: pick("prompt_tokens"),
        completion_tokens: pick("completion_tokens"),
        cache_hit_tokens: pick("prompt_cache_hit_tokens"),
    })
}
