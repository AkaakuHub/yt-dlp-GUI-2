use crate::config::Settings;

pub(super) struct ServerCliOptions {
    host: String,
    port: u16,
}

impl ServerCliOptions {
    pub(super) fn from_args(args: Vec<String>) -> Result<Self, String> {
        let settings = Settings::new();
        let mut host = "0.0.0.0".to_string();
        let mut port = settings.server_port;
        let mut index = 0;

        while index < args.len() {
            let key = &args[index];
            let value = args
                .get(index + 1)
                .ok_or_else(|| format!("{}には値が必要です", key))?;
            match key.as_str() {
                "--host" => host = value.clone(),
                "--port" => {
                    port = value
                        .parse::<u16>()
                        .map_err(|e| format!("ポート番号が不正です: {}", e))?
                }
                _ => return Err(format!("不明なオプションです: {}", key)),
            }
            index += 2;
        }

        Ok(Self { host, port })
    }

    pub(super) fn address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
