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
        Migration {
            version: 3,
            description: "attempt ledger events and settle snapshots",
            sql: "CREATE TABLE attempts (
            id TEXT PRIMARY KEY NOT NULL,
            mandate_id TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            settled_at INTEGER,
            status TEXT,
            snapshot_last_seq INTEGER,
            snapshot_json TEXT
        );
        CREATE INDEX attempts_mandate_started ON attempts (mandate_id, started_at);
        CREATE TABLE attempt_events (
            attempt_id TEXT NOT NULL,
            mandate_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            event_json TEXT NOT NULL,
            PRIMARY KEY (attempt_id, seq)
        );
        CREATE INDEX attempt_events_mandate ON attempt_events (mandate_id, attempt_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "entitlement meters",
            sql: "CREATE TABLE meters (
            subject_id TEXT NOT NULL,
            meter_key TEXT NOT NULL,
            period_key TEXT NOT NULL,
            value INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (subject_id, meter_key, period_key)
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "mandate lifecycle standing policy parent",
            sql: "ALTER TABLE mandates ADD COLUMN status TEXT;
        ALTER TABLE mandates ADD COLUMN parent_mandate_id TEXT;
        ALTER TABLE mandates ADD COLUMN standing_policy_json TEXT;
        UPDATE mandates SET status = 'armed' WHERE status IS NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "mandate success_criteria_json",
            sql: "ALTER TABLE mandates ADD COLUMN success_criteria_json TEXT;
        UPDATE mandates SET success_criteria_json = '{\"version\":1,\"kind\":\"attempt_completed\"}'
          WHERE success_criteria_json IS NULL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "chats metadata-only (ledger owns transcript)",
            sql: "DROP TABLE IF EXISTS chats;
        CREATE TABLE chats (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            model_id TEXT NOT NULL,
            mandate_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
            kind: MigrationKind::Up,
        },
    ]
}
