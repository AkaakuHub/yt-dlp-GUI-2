use rusqlite::Connection;

const CREATE_SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    run_at_ms INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '未実行',
    error_message TEXT NOT NULL DEFAULT '',
    param_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_monitor_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    channel_url TEXT NOT NULL,
    weekdays_json TEXT NOT NULL,
    check_time TEXT NOT NULL,
    include_words_json TEXT NOT NULL,
    exclude_words_json TEXT NOT NULL,
    param_json TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    next_check_at_ms INTEGER NOT NULL,
    last_checked_at_ms INTEGER,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_monitor_rule_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    weekdays_json TEXT NOT NULL,
    check_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_monitor_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    content_key TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    UNIQUE(rule_id, content_key)
);";

pub fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(CREATE_SCHEMA_SQL)
        .map_err(|e| format!("予約DBを初期化できません: {}", e))?;
    add_column_if_missing(
        connection,
        "reservations",
        "result",
        "TEXT NOT NULL DEFAULT '未実行'",
    )?;
    add_column_if_missing(
        connection,
        "reservations",
        "error_message",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    Ok(())
}

fn add_column_if_missing(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    if has_column(connection, table_name, column_name)? {
        return Ok(());
    }
    connection
        .execute(
            &format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"),
            [],
        )
        .map_err(|e| format!("予約DBの列を追加できません: {}", e))?;
    Ok(())
}

fn has_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> Result<bool, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(|e| format!("予約DBの列情報を取得できません: {}", e))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("予約DBの列情報を取得できません: {}", e))?;
    for row in rows {
        if row.map_err(|e| format!("予約DBの列情報を読めません: {}", e))? == column_name
        {
            return Ok(true);
        }
    }
    Ok(false)
}
