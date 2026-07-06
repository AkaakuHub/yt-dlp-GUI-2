use std::{fs, path::PathBuf};

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::{config::get_config_root, download_command::RunCommandParam};

const DATABASE_FILENAME: &str = "reservations.sqlite3";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledReservation {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub run_at_ms: u64,
    pub kind: String,
    pub status: String,
}

#[derive(Clone)]
pub struct PendingReservation {
    pub id: i64,
    pub param: RunCommandParam,
    pub run_at_ms: u64,
}

#[derive(Clone)]
pub struct ReservationStore {
    database_path: PathBuf,
}

impl ReservationStore {
    pub fn new() -> Result<Self, String> {
        let config_root = get_config_root();
        fs::create_dir_all(&config_root)
            .map_err(|e| format!("予約DBディレクトリを作成できません: {}", e))?;
        let store = Self {
            database_path: config_root.join(DATABASE_FILENAME),
        };
        store.initialize()?;
        Ok(store)
    }

    pub fn add_reservation(
        &self,
        title: String,
        url: String,
        run_at_ms: u64,
        kind: String,
        param: &RunCommandParam,
    ) -> Result<i64, String> {
        let now_ms = current_time_ms()?;
        let param_json = serde_json::to_string(param)
            .map_err(|e| format!("予約内容をJSONに変換できません: {}", e))?;
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO reservations
                (title, url, run_at_ms, kind, status, param_json, created_at_ms, updated_at_ms)
                VALUES (?1, ?2, ?3, ?4, '予約中', ?5, ?6, ?6)",
                params![title, url, u64_to_i64(run_at_ms)?, kind, param_json, u64_to_i64(now_ms)?],
            )
            .map_err(|e| format!("予約を保存できません: {}", e))?;
        Ok(connection.last_insert_rowid())
    }

    pub fn update_status(&self, id: i64, status: &str) -> Result<(), String> {
        let now_ms = current_time_ms()?;
        self.connection()?
            .execute(
                "UPDATE reservations SET status = ?1, updated_at_ms = ?2 WHERE id = ?3",
                params![status, u64_to_i64(now_ms)?, id],
            )
            .map_err(|e| format!("予約状態を更新できません: {}", e))?;
        Ok(())
    }

    pub fn reservations(&self) -> Result<Vec<ScheduledReservation>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, title, url, run_at_ms, kind, status
                FROM reservations
                ORDER BY run_at_ms ASC, id ASC",
            )
            .map_err(|e| format!("予約一覧を取得できません: {}", e))?;
        let rows = statement
            .query_map([], |row| {
                let run_at_ms: i64 = row.get(3)?;
                Ok(ScheduledReservation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    url: row.get(2)?,
                    run_at_ms: i64_to_u64(run_at_ms).unwrap_or(0),
                    kind: row.get(4)?,
                    status: row.get(5)?,
                })
            })
            .map_err(|e| format!("予約一覧を取得できません: {}", e))?;

        let mut reservations = Vec::new();
        for row in rows {
            reservations.push(row.map_err(|e| format!("予約一覧を読めません: {}", e))?);
        }
        Ok(reservations)
    }

    pub fn pending_reservations(&self) -> Result<Vec<PendingReservation>, String> {
        let now_ms = current_time_ms()?;
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, param_json, run_at_ms
                FROM reservations
                WHERE status = '予約中' AND run_at_ms > ?1
                ORDER BY run_at_ms ASC, id ASC",
            )
            .map_err(|e| format!("未実行予約を取得できません: {}", e))?;
        let rows = statement
            .query_map([u64_to_i64(now_ms)?], |row| {
                let param_json: String = row.get(1)?;
                let run_at_ms: i64 = row.get(2)?;
                Ok((row.get::<_, i64>(0)?, param_json, run_at_ms))
            })
            .map_err(|e| format!("未実行予約を取得できません: {}", e))?;

        let mut reservations = Vec::new();
        for row in rows {
            let (id, param_json, run_at_ms) =
                row.map_err(|e| format!("未実行予約を読めません: {}", e))?;
            let param = serde_json::from_str::<RunCommandParam>(&param_json)
                .map_err(|e| format!("未実行予約の内容を読めません: {}", e))?;
            reservations.push(PendingReservation {
                id,
                param,
                run_at_ms: i64_to_u64(run_at_ms)?,
            });
        }
        Ok(reservations)
    }

    fn initialize(&self) -> Result<(), String> {
        self.connection()?
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS reservations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    run_at_ms INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    param_json TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    updated_at_ms INTEGER NOT NULL
                );",
            )
            .map_err(|e| format!("予約DBを初期化できません: {}", e))
    }

    fn connection(&self) -> Result<Connection, String> {
        Connection::open(&self.database_path).map_err(|e| format!("予約DBを開けません: {}", e))
    }
}

fn current_time_ms() -> Result<u64, String> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("現在時刻の取得に失敗しました: {}", e))?;
    u64::try_from(duration.as_millis()).map_err(|_| "現在時刻が大きすぎます".to_string())
}

fn u64_to_i64(value: u64) -> Result<i64, String> {
    i64::try_from(value).map_err(|_| "時刻が大きすぎます".to_string())
}

fn i64_to_u64(value: i64) -> Result<u64, String> {
    u64::try_from(value).map_err(|_| "時刻が不正です".to_string())
}
