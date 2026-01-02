const fs = require("fs");
const path = require("path");

const repoRoot = process.cwd();
const source = path.join(repoRoot, "src-tauri", "tools-manifest.json");
const targetDir = path.join(repoRoot, "src-tauri", "target", "debug");
const target = path.join(targetDir, "tools-manifest.json");

if (!fs.existsSync(source)) {
  console.error("tools-manifest.json not found at src-tauri/tools-manifest.json. Run scripts/gen-tools-manifest.py first.");
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied tools-manifest.json -> ${target}`);
