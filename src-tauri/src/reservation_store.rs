use std::{fs, path::PathBuf};

use chrono::{Datelike, Duration, Local, TimeZone};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMonitorRuleRequest {
    pub title: String,
    pub channel_url: String,
    pub schedules: Vec<ChannelMonitorSchedule>,
    pub include_words: Vec<String>,
    pub exclude_words: Vec<String>,
    pub param: RunCommandParam,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMonitorSchedule {
    pub weekdays: Vec<u8>,
    pub check_time: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelMonitorRule {
    pub id: i64,
    pub title: String,
    pub channel_url: String,
    pub schedules: Vec<ChannelMonitorSchedule>,
    pub include_words: Vec<String>,
    pub exclude_words: Vec<String>,
    pub enabled: bool,
    pub next_check_at_ms: u64,
    pub last_checked_at_ms: Option<u64>,
    pub status: String,
}

#[derive(Clone)]
pub struct PendingChannelMonitorRule {
    pub id: i64,
    pub channel_url: String,
    pub include_words: Vec<String>,
    pub exclude_words: Vec<String>,
    pub param: RunCommandParam,
    pub next_check_at_ms: u64,
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
                params![
                    title,
                    url,
                    u64_to_i64(run_at_ms)?,
                    kind,
                    param_json,
                    u64_to_i64(now_ms)?
                ],
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

    pub fn add_channel_monitor_rule(
        &self,
        request: ChannelMonitorRuleRequest,
    ) -> Result<i64, String> {
        validate_channel_monitor_rule(&request)?;
        let now_ms = current_time_ms()?;
        let next_check_at_ms = next_check_at_ms_for_schedules(&request.schedules)?;
        let first_schedule = request
            .schedules
            .first()
            .ok_or_else(|| "監視スケジュールを追加してください".to_string())?;
        let weekdays_json = serde_json::to_string(&first_schedule.weekdays)
            .map_err(|e| format!("監視曜日をJSONに変換できません: {}", e))?;
        let include_words_json = serde_json::to_string(&clean_words(&request.include_words))
            .map_err(|e| format!("含むワードをJSONに変換できません: {}", e))?;
        let exclude_words_json = serde_json::to_string(&clean_words(&request.exclude_words))
            .map_err(|e| format!("含まないワードをJSONに変換できません: {}", e))?;
        let param_json = serde_json::to_string(&request.param)
            .map_err(|e| format!("監視実行内容をJSONに変換できません: {}", e))?;
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO channel_monitor_rules
                (title, channel_url, weekdays_json, check_time, include_words_json,
                 exclude_words_json, param_json, enabled, next_check_at_ms,
                 last_checked_at_ms, status, created_at_ms, updated_at_ms)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, NULL, '監視中', ?9, ?9)",
                params![
                    request.title.trim(),
                    request.channel_url.trim(),
                    weekdays_json,
                    first_schedule.check_time.trim(),
                    include_words_json,
                    exclude_words_json,
                    param_json,
                    u64_to_i64(next_check_at_ms)?,
                    u64_to_i64(now_ms)?,
                ],
            )
            .map_err(|e| format!("チャンネル監視を保存できません: {}", e))?;
        let rule_id = connection.last_insert_rowid();
        for schedule in &request.schedules {
            connection
                .execute(
                    "INSERT INTO channel_monitor_rule_schedules
                    (rule_id, weekdays_json, check_time)
                    VALUES (?1, ?2, ?3)",
                    params![
                        rule_id,
                        serde_json::to_string(&schedule.weekdays)
                            .map_err(|e| format!("監視曜日をJSONに変換できません: {}", e))?,
                        schedule.check_time.trim(),
                    ],
                )
                .map_err(|e| format!("監視スケジュールを保存できません: {}", e))?;
        }
        Ok(rule_id)
    }

    pub fn channel_monitor_rules(&self) -> Result<Vec<ChannelMonitorRule>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, title, channel_url,
                 include_words_json, exclude_words_json, enabled, next_check_at_ms,
                 last_checked_at_ms, status
                 FROM channel_monitor_rules
                 ORDER BY id ASC",
            )
            .map_err(|e| format!("チャンネル監視一覧を取得できません: {}", e))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, String>(8)?,
                ))
            })
            .map_err(|e| format!("チャンネル監視一覧を取得できません: {}", e))?;

        let mut rules = Vec::new();
        for row in rows {
            let (
                id,
                title,
                channel_url,
                include_words_json,
                exclude_words_json,
                enabled,
                next_check_at_ms,
                last_checked_at_ms,
                status,
            ) = row.map_err(|e| format!("チャンネル監視一覧を読めません: {}", e))?;
            let schedules = self.channel_monitor_schedules(id)?;
            rules.push(ChannelMonitorRule {
                id,
                title,
                channel_url,
                schedules,
                include_words: serde_json::from_str(&include_words_json)
                    .map_err(|e| format!("含むワードを読めません: {}", e))?,
                exclude_words: serde_json::from_str(&exclude_words_json)
                    .map_err(|e| format!("含まないワードを読めません: {}", e))?,
                enabled: enabled == 1,
                next_check_at_ms: i64_to_u64(next_check_at_ms)?,
                last_checked_at_ms: last_checked_at_ms.map(i64_to_u64).transpose()?,
                status,
            });
        }
        Ok(rules)
    }

    pub fn pending_channel_monitor_rules(&self) -> Result<Vec<PendingChannelMonitorRule>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, channel_url, include_words_json, exclude_words_json,
                 param_json, next_check_at_ms
                 FROM channel_monitor_rules
                 WHERE enabled = 1
                 ORDER BY next_check_at_ms ASC, id ASC",
            )
            .map_err(|e| format!("チャンネル監視を取得できません: {}", e))?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .map_err(|e| format!("チャンネル監視を取得できません: {}", e))?;

        let mut rules = Vec::new();
        for row in rows {
            let (
                id,
                channel_url,
                include_words_json,
                exclude_words_json,
                param_json,
                next_check_at_ms,
            ) = row.map_err(|e| format!("チャンネル監視を読めません: {}", e))?;
            rules.push(PendingChannelMonitorRule {
                id,
                channel_url,
                include_words: serde_json::from_str(&include_words_json)
                    .map_err(|e| format!("含むワードを読めません: {}", e))?,
                exclude_words: serde_json::from_str(&exclude_words_json)
                    .map_err(|e| format!("含まないワードを読めません: {}", e))?,
                param: serde_json::from_str(&param_json)
                    .map_err(|e| format!("監視実行内容を読めません: {}", e))?,
                next_check_at_ms: i64_to_u64(next_check_at_ms)?,
            });
        }
        Ok(rules)
    }

    pub fn mark_channel_monitor_checked(&self, id: i64, status: &str) -> Result<u64, String> {
        let rule = self
            .channel_monitor_rules()?
            .into_iter()
            .find(|rule| rule.id == id)
            .ok_or_else(|| "チャンネル監視が見つかりません".to_string())?;
        let now_ms = current_time_ms()?;
        let next_check_at_ms = next_check_at_ms_for_schedules(&rule.schedules)?;
        self.connection()?
            .execute(
                "UPDATE channel_monitor_rules
                 SET next_check_at_ms = ?1, last_checked_at_ms = ?2, status = ?3, updated_at_ms = ?2
                 WHERE id = ?4",
                params![
                    u64_to_i64(next_check_at_ms)?,
                    u64_to_i64(now_ms)?,
                    status,
                    id
                ],
            )
            .map_err(|e| format!("チャンネル監視状態を更新できません: {}", e))?;
        Ok(next_check_at_ms)
    }

    pub fn has_channel_monitor_hit(&self, rule_id: i64, content_key: &str) -> Result<bool, String> {
        let count: i64 = self
            .connection()?
            .query_row(
                "SELECT COUNT(*) FROM channel_monitor_hits WHERE rule_id = ?1 AND content_key = ?2",
                params![rule_id, content_key],
                |row| row.get(0),
            )
            .map_err(|e| format!("監視済み動画を確認できません: {}", e))?;
        Ok(count > 0)
    }

    pub fn add_channel_monitor_hit(
        &self,
        rule_id: i64,
        content_key: &str,
        url: &str,
        title: &str,
    ) -> Result<(), String> {
        self.connection()?
            .execute(
                "INSERT OR IGNORE INTO channel_monitor_hits
                (rule_id, content_key, url, title, created_at_ms)
                VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    rule_id,
                    content_key,
                    url,
                    title,
                    u64_to_i64(current_time_ms()?)?
                ],
            )
            .map_err(|e| format!("監視済み動画を保存できません: {}", e))?;
        Ok(())
    }

    fn channel_monitor_schedules(
        &self,
        rule_id: i64,
    ) -> Result<Vec<ChannelMonitorSchedule>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT weekdays_json, check_time
                 FROM channel_monitor_rule_schedules
                 WHERE rule_id = ?1
                 ORDER BY id ASC",
            )
            .map_err(|e| format!("監視スケジュールを取得できません: {}", e))?;
        let rows = statement
            .query_map([rule_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("監視スケジュールを取得できません: {}", e))?;
        let mut schedules = Vec::new();
        for row in rows {
            let (weekdays_json, check_time) =
                row.map_err(|e| format!("監視スケジュールを読めません: {}", e))?;
            schedules.push(ChannelMonitorSchedule {
                weekdays: serde_json::from_str(&weekdays_json)
                    .map_err(|e| format!("監視曜日を読めません: {}", e))?,
                check_time,
            });
        }
        Ok(schedules)
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

fn validate_channel_monitor_rule(request: &ChannelMonitorRuleRequest) -> Result<(), String> {
    if request.title.trim().is_empty() {
        return Err("監視名を入力してください".to_string());
    }
    if request.channel_url.trim().is_empty() {
        return Err("チャンネルURLを入力してください".to_string());
    }
    if request.schedules.is_empty() {
        return Err("監視スケジュールを追加してください".to_string());
    }
    for schedule in &request.schedules {
        if schedule.weekdays.is_empty() {
            return Err("監視する曜日を選択してください".to_string());
        }
        if schedule
            .weekdays
            .iter()
            .any(|weekday| !(1..=7).contains(weekday))
        {
            return Err("曜日が不正です".to_string());
        }
        parse_check_time(&schedule.check_time)?;
    }
    Ok(())
}

fn next_check_at_ms_for_schedules(schedules: &[ChannelMonitorSchedule]) -> Result<u64, String> {
    schedules
        .iter()
        .map(|schedule| next_check_at_ms(&schedule.weekdays, &schedule.check_time))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .min()
        .ok_or_else(|| "次回監視時刻を計算できません".to_string())
}

fn next_check_at_ms(weekdays: &[u8], check_time: &str) -> Result<u64, String> {
    let (hour, minute) = parse_check_time(check_time)?;
    let now = Local::now();
    for day_offset in 0..=7 {
        let date = now.date_naive() + Duration::days(day_offset);
        let weekday = u8::try_from(date.weekday().num_days_from_monday())
            .map_err(|_| "曜日を計算できません".to_string())?
            + 1;
        if !weekdays.contains(&weekday) {
            continue;
        }
        let Some(naive_datetime) = date.and_hms_opt(u32::from(hour), u32::from(minute), 0) else {
            return Err("監視時刻が不正です".to_string());
        };
        let Some(candidate) = Local.from_local_datetime(&naive_datetime).earliest() else {
            continue;
        };
        if candidate > now {
            return u64::try_from(candidate.timestamp_millis())
                .map_err(|_| "次回監視時刻が不正です".to_string());
        }
    }
    Err("次回監視時刻を計算できません".to_string())
}

fn parse_check_time(value: &str) -> Result<(u8, u8), String> {
    let Some((hour_text, minute_text)) = value.trim().split_once(':') else {
        return Err("監視時刻はHH:MMで入力してください".to_string());
    };
    let hour = hour_text
        .parse::<u8>()
        .map_err(|_| "監視時刻の時が不正です".to_string())?;
    let minute = minute_text
        .parse::<u8>()
        .map_err(|_| "監視時刻の分が不正です".to_string())?;
    if hour > 23 || minute > 59 {
        return Err("監視時刻が不正です".to_string());
    }
    Ok((hour, minute))
}

fn clean_words(words: &[String]) -> Vec<String> {
    words
        .iter()
        .map(|word| word.trim())
        .filter(|word| !word.is_empty())
        .map(ToString::to_string)
        .collect()
}
