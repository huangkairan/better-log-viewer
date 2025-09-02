// 防止 Windows 上出现控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, Local};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LogEntry {
    id: usize,
    timestamp: Option<String>,
    level: String,
    message: String,
    raw: String,
    metadata: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LogFile {
    name: String,
    path: String,
    size: u64,
    last_modified: String,
    entries: Vec<LogEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LogStats {
    total: usize,
    info: usize,
    warn: usize,
    error: usize,
    debug: usize,
    trace: usize,
}

// 解析日志文件
#[tauri::command]
fn parse_log_file(path: String) -> Result<LogFile, String> {
    println!("parse_log_file called with path: {}", path);
    let path_buf = PathBuf::from(&path);
    
    // 读取文件内容
    let content = fs::read_to_string(&path_buf)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    println!("File content length: {} bytes", content.len());
    println!("First 200 chars: {}", &content.chars().take(200).collect::<String>());
    
    // 获取文件元数据
    let metadata = fs::metadata(&path_buf)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    let file_name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            DateTime::<Local>::from(std::time::UNIX_EPOCH + d)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string()
        })
        .unwrap_or_else(|| "Unknown".to_string());
    
    // 解析日志条目
    let entries = parse_log_entries(&content);
    
    println!("Parsed {} log entries", entries.len());
    for (i, entry) in entries.iter().take(3).enumerate() {
        println!("Entry {}: level={}, message_len={}", i, entry.level, entry.message.len());
    }
    
    Ok(LogFile {
        name: file_name,
        path,
        size: metadata.len(),
        last_modified,
        entries,
    })
}

// 解析日志条目
fn parse_log_entries(content: &str) -> Vec<LogEntry> {
    let lines: Vec<&str> = content.lines().collect();
    let mut entries = Vec::new();
    let mut current_entry: Option<String> = None;
    let mut id = 0;
    
    // 正则表达式匹配不同的日志格式
    let timestamp_regex = Regex::new(r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)").unwrap();
    let level_regex = Regex::new(r"(?i)\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\b").unwrap();
    let json_regex = Regex::new(r"\{[^}]+\}").unwrap();
    
    for line in lines {
        // 跳过空行和元数据行
        if line.trim().is_empty() || line.starts_with("The relevant information") {
            continue;
        }
        
        // 处理带行号的格式（如 "5→" 开头）
        let clean_line = if let Some(pos) = line.find('→') {
            &line[pos + 1..]
        } else {
            line
        };
        
        // 移除 ANSI 转义序列
        let clean_line = strip_ansi_escapes::strip_str(clean_line);
        
        // 检测是否是新的日志条目
        let is_new_entry = timestamp_regex.is_match(&clean_line) || 
                          level_regex.is_match(&clean_line) ||
                          json_regex.is_match(&clean_line);
        
        if is_new_entry {
            // 保存之前的条目
            if let Some(entry_text) = current_entry.take() {
                if let Some(entry) = parse_single_entry(&entry_text, id) {
                    entries.push(entry);
                    id += 1;
                }
            }
            current_entry = Some(clean_line.to_string());
        } else if let Some(ref mut entry) = current_entry {
            // 追加到当前条目
            entry.push('\n');
            entry.push_str(&clean_line);
        } else {
            // 开始新条目
            current_entry = Some(clean_line.to_string());
        }
    }
    
    // 处理最后一个条目
    if let Some(entry_text) = current_entry {
        if let Some(entry) = parse_single_entry(&entry_text, id) {
            entries.push(entry);
        }
    }
    
    entries
}

// 解析单个日志条目
fn parse_single_entry(text: &str, id: usize) -> Option<LogEntry> {
    let timestamp_regex = Regex::new(r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)").unwrap();
    let level_regex = Regex::new(r"(?i)\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)\b").unwrap();
    
    let timestamp = timestamp_regex
        .find(text)
        .map(|m| m.as_str().to_string());
    
    let level = level_regex
        .find(text)
        .map(|m| m.as_str().to_uppercase())
        .unwrap_or_else(|| "INFO".to_string());
    
    // 提取 JSON 元数据
    let mut metadata = HashMap::new();
    if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(text) {
        if let serde_json::Value::Object(map) = json_value {
            for (key, value) in map {
                metadata.insert(key, value.to_string());
            }
        }
    }
    
    Some(LogEntry {
        id,
        timestamp,
        level,
        message: text.to_string(),
        raw: text.to_string(),
        metadata,
    })
}

// 获取日志统计
#[tauri::command]
fn get_log_stats(entries: Vec<LogEntry>) -> LogStats {
    let mut stats = LogStats {
        total: entries.len(),
        info: 0,
        warn: 0,
        error: 0,
        debug: 0,
        trace: 0,
    };
    
    for entry in entries {
        match entry.level.as_str() {
            "INFO" => stats.info += 1,
            "WARN" | "WARNING" => stats.warn += 1,
            "ERROR" | "FATAL" => stats.error += 1,
            "DEBUG" => stats.debug += 1,
            "TRACE" => stats.trace += 1,
            _ => {}
        }
    }
    
    stats
}

// 搜索日志
#[tauri::command]
fn search_logs(entries: Vec<LogEntry>, query: String) -> Vec<LogEntry> {
    if query.is_empty() {
        return entries;
    }
    
    let query_lower = query.to_lowercase();
    entries
        .into_iter()
        .filter(|entry| {
            entry.message.to_lowercase().contains(&query_lower) ||
            entry.level.to_lowercase().contains(&query_lower) ||
            entry.timestamp.as_ref()
                .map(|t| t.to_lowercase().contains(&query_lower))
                .unwrap_or(false)
        })
        .collect()
}

// 过滤日志级别
#[tauri::command]
fn filter_by_level(entries: Vec<LogEntry>, levels: Vec<String>) -> Vec<LogEntry> {
    if levels.is_empty() {
        return entries;
    }
    
    entries
        .into_iter()
        .filter(|entry| levels.contains(&entry.level))
        .collect()
}

#[derive(Debug, Serialize, Deserialize)]
struct HistoryItem {
    path: String,
    accessed_at: String,
    file_size: u64,
    file_name: String,
}

// 保存历史记录
#[tauri::command]
fn save_history(app_handle: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app dir: {}", e))?;
    
    let history_file = app_dir.join("history.json");
    
    // 读取现有历史
    let mut history: Vec<HistoryItem> = if history_file.exists() {
        let content = fs::read_to_string(&history_file)
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };
    
    // 获取文件信息
    let path_buf = PathBuf::from(&file_path);
    let file_name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
        
    let file_size = fs::metadata(&path_buf)
        .map(|m| m.len())
        .unwrap_or(0);
    
    let accessed_at = Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    
    // 创建新的历史项目
    let new_item = HistoryItem {
        path: file_path.clone(),
        accessed_at,
        file_size,
        file_name,
    };
    
    // 移除重复项
    history.retain(|item| item.path != file_path);
    
    // 添加到开头
    history.insert(0, new_item);
    
    // 保留最近20个文件
    history.truncate(20);
    
    // 保存历史
    let history_json = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    
    fs::write(&history_file, history_json)
        .map_err(|e| format!("Failed to write history: {}", e))?;
    
    Ok(())
}

// 获取历史记录
#[tauri::command]
fn get_history(app_handle: tauri::AppHandle) -> Result<Vec<HistoryItem>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    
    let history_file = app_dir.join("history.json");
    
    if !history_file.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&history_file)
        .map_err(|e| format!("Failed to read history: {}", e))?;
    
    // 尝试解析新格式，如果失败则尝试旧格式
    if let Ok(history) = serde_json::from_str::<Vec<HistoryItem>>(&content) {
        Ok(history)
    } else if let Ok(old_history) = serde_json::from_str::<Vec<String>>(&content) {
        // 兼容旧格式，转换为新格式
        let history: Vec<HistoryItem> = old_history
            .into_iter()
            .map(|path| {
                let path_buf = PathBuf::from(&path);
                let file_name = path_buf
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                let file_size = fs::metadata(&path_buf)
                    .map(|m| m.len())
                    .unwrap_or(0);
                
                HistoryItem {
                    path,
                    accessed_at: "Unknown".to_string(),
                    file_size,
                    file_name,
                }
            })
            .collect();
        
        Ok(history)
    } else {
        Err("Failed to parse history file".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            parse_log_file,
            get_log_stats,
            search_logs,
            filter_by_level,
            save_history,
            get_history
        ])
        .setup(|_app| {
            // 不自动打开开发者工具
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}