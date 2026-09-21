mod ai;
mod files;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

/// 初始表结构与示例数据（src-tauri/migrations/0001_init.sql）
const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");
/// v0.2：手动排序 + 重复任务
const SORT_REPEAT_SQL: &str = include_str!("../migrations/0002_sort_and_repeat.sql");
/// v0.3：提醒记录 + 软删除
const REMINDER_TRASH_SQL: &str = include_str!("../migrations/0003_reminder_and_trash.sql");
/// v0.4：提醒提前量
const REMIND_BEFORE_SQL: &str = include_str!("../migrations/0004_remind_before.sql");

/// 全局快捷键：任何界面下唤起快速新增
const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";

/// 把主窗口显示出来、取消最小化并聚焦
pub fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 系统托盘：左键显示窗口，右键菜单提供 显示 / 快速新增 / 退出
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quick_item = MenuItem::with_id(app, "quick-add", "快速新增待办", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show_item, &quick_item, &separator, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("我的记事簿")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quick-add" => {
                show_main_window(app);
                let _ = app.emit("quick-add", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create folders/tasks tables and seed demo data",
            sql: INIT_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add manual sort_order and repeat_rule",
            sql: SORT_REPEAT_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add notified_at and deleted_at (trash)",
            sql: REMINDER_TRASH_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add remind_before (reminder lead time)",
            sql: REMIND_BEFORE_SQL,
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    // 单实例必须最先注册：第二次启动时聚焦已有窗口，而不是再开一个进程
    // （否则会出现两条 SQLite 连接、提醒重复弹）
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app);
    }));

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:memo.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            files::export_text_file,
            files::import_text_file,
            files::backup_now,
            files::list_backups,
            files::show_main_window,
            files::data_paths,
            files::open_data_dir,
            files::open_url,
            ai::ai_key_status,
            ai::ai_set_key,
            ai::ai_clear_key,
            ai::ai_chat,
        ])
        .setup(|app| {
            build_tray(app.handle())?;

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::ShortcutState;
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts([QUICK_ADD_SHORTCUT])?
                        .with_handler(|app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                show_main_window(app);
                                let _ = app.emit("quick-add", ());
                            }
                        })
                        .build(),
                )?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口 = 收进托盘，保证提醒仍然有效；真正退出走托盘菜单
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();

                use tauri_plugin_notification::NotificationExt;
                let _ = window
                    .app_handle()
                    .notification()
                    .builder()
                    .title("我的记事簿")
                    .body("已最小化到系统托盘，提醒继续生效；右键托盘图标可退出")
                    .show();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
