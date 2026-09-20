use tauri_plugin_sql::{Migration, MigrationKind};

/// 初始表结构与示例数据（src-tauri/migrations/0001_init.sql）
const INIT_SQL: &str = include_str!("../migrations/0001_init.sql");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create folders/tasks tables and seed demo data",
        sql: INIT_SQL,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:memo.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
