use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolsManifest {
    pub(crate) tools: HashMap<String, ToolEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolEntry {
    pub(crate) version: Option<String>,
    pub(crate) artifacts: Vec<ToolArtifact>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolArtifact {
    pub(crate) os: String,
    pub(crate) arch: String,
    pub(crate) url: String,
    pub(crate) sha256: String,
    pub(crate) filename: Option<String>,
}

pub(crate) fn find_tool_artifact<'a>(
    manifest: &'a ToolsManifest,
    tool_name: &'a str,
    os: &'a str,
    arch: &'a str,
) -> Result<&'a ToolArtifact, String> {
    let tool = manifest
        .tools
        .get(tool_name)
        .ok_or_else(|| format!("tools-manifest.jsonに{}の定義がありません", tool_name))?;

    tool.artifacts
        .iter()
        .find(|artifact| artifact.os == os && artifact.arch == arch)
        .ok_or_else(|| {
            format!(
                "tools-manifest.jsonに{}の{} {}向けアーティファクトがありません",
                tool_name, os, arch
            )
        })
}

pub(crate) fn artifact_filename(artifact: &ToolArtifact) -> Result<String, String> {
    if let Some(name) = &artifact.filename {
        return Ok(name.clone());
    }

    let without_query = artifact.url.split('?').next().unwrap_or(&artifact.url);
    let name = without_query.rsplit('/').next().unwrap_or("download");
    if name.is_empty() {
        return Err("アーティファクトのファイル名が取得できません".to_string());
    }
    Ok(name.to_string())
}

pub(crate) fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub(crate) fn tools_manifest_download_url(app_version: &str) -> String {
    format!(
        "https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/download/v{}/tools-manifest.json",
        app_version
    )
}

pub(crate) async fn load_tools_manifest_from_release(
    app_version: &str,
) -> Result<ToolsManifest, String> {
    let url = tools_manifest_download_url(app_version);
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download tools-manifest.json: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download tools-manifest.json: HTTP {}",
            response.status()
        ));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read tools-manifest.json: {}", e))?;

    serde_json::from_str::<ToolsManifest>(&content)
        .map_err(|e| format!("tools-manifest.jsonの形式が不正です: {}", e))
}
