const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const source = path.join(repoRoot, "src-tauri", "tools-manifest.json");
const targetDir = path.join(repoRoot, "src-tauri", "target", "debug");
const target = path.join(targetDir, "tools-manifest.json");

async function ensureManifest() {
  if (fs.existsSync(source)) return;

  const url =
    "https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest/download/tools-manifest.json";
  console.log(
    "[copy-tools-manifest] local manifest not found, downloading latest release asset..."
  );
  const https = await import("node:https");
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(source);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(`Failed to download manifest: ${res.statusCode} ${res.statusMessage}`)
          );
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
  console.log("[copy-tools-manifest] downloaded tools-manifest.json");
}

async function main() {
  await ensureManifest();
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied tools-manifest.json -> ${target}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
