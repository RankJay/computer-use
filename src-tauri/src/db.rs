use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create chats table",
            sql: "CREATE TABLE chats (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model_id TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "mandates table and chat.mandate_id",
            sql: "CREATE TABLE mandates (
            id TEXT PRIMARY KEY NOT NULL,
            created_at INTEGER NOT NULL,
            kind TEXT NOT NULL
        );
        ALTER TABLE chats ADD COLUMN mandate_id TEXT;",
            kind: MigrationKind::Up,
        },
    ]
}
