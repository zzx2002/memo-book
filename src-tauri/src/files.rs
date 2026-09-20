//! 文件相关的原生命令：导出 / 导入 / 自动备份。
//!
//! 全部文件读写都在 Rust 侧完成，前端只通过 `invoke` 传内容与文件名，
//! 因此不需要给前端开放 fs 插件的能力（capability），减少攻击面。

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

/// 自动备份保留的份数
const BACKUP_KEEP: usize = 7;

fn backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("拿不到应用数据目录：{e}"))?;
    Ok(dir.join("backups"))
}

/// 只保留最近 BACKUP_KEEP 份备份，其余删掉
fn prune_backups(dir: &PathBuf) -> Result<usize, String> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.path()))
        })
        .collect();

    files.sort_by(|a, b| b.0.cmp(&a.0)); // 新的在前
    let mut removed = 0;
    for (_, path) in files.into_iter().skip(BACKUP_KEEP) {
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// 弹出「另存为」对话框并写入文本；用户取消返回 None
#[tauri::command]
pub async fn export_text_file(
    app: AppHandle,
    file_name: String,
    contents: String,
    format: String,
) -> Result<Option<String>, String> {
    let (filter_name, extension) = if format == "markdown" {
        ("Markdown", "md")
    } else {
        ("JSON", "json")
    };

    let picked = app
        .dialog()
        .file()
        .set_title("导出我的记事簿")
        .set_file_name(&file_name)
        .add_filter(filter_name, &[extension])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, contents).map_err(|e| format!("写入失败：{e}"))?;
    Ok(Some(path.display().to_string()))
}

/// 弹出「打开」对话框并读回文本；用户取消返回 None
#[tauri::command]
pub async fn import_text_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("导入 JSON 备份")
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("读取失败：{e}"))
}

/// 立即写一份备份到应用数据目录，并清理旧备份
#[tauri::command]
pub async fn backup_now(app: AppHandle, contents: String, stamp: String) -> Result<String, String> {
    let dir = backup_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败：{e}"))?;
    let path = dir.join(format!("memo-{stamp}.json"));
    fs::write(&path, contents).map_err(|e| format!("写入失败：{e}"))?;
    let _ = prune_backups(&dir);
    Ok(path.display().to_string())
}

/// 列出已有备份（新的在前）
#[tauri::command]
pub async fn list_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = backup_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<(std::time::SystemTime, String)> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, entry.file_name().to_string_lossy().to_string()))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(files.into_iter().map(|(_, name)| name).collect())
}

/// 把主窗口显示出来并聚焦（提醒触发、托盘点击、单实例第二次启动都会用到）
#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    crate::show_main_window(&app);
}
