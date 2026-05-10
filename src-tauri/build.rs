fn main() {
    ensure_server_cli_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_server_cli_sidecar_placeholder() {
    let Ok(target) = std::env::var("TARGET") else {
        return;
    };
    let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") else {
        return;
    };

    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let binaries_dir = std::path::Path::new(&manifest_dir).join("binaries");
    let sidecar_path = binaries_dir.join(format!("server_cli-{}{}", target, extension));
    if sidecar_path.exists() {
        return;
    }

    if std::fs::create_dir_all(&binaries_dir).is_ok() {
        let _ = std::fs::write(sidecar_path, "");
    }
}
