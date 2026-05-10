const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { execFileSync } = require("node:child_process");

const rootDir = join(__dirname, "..");
const tauriDir = join(rootDir, "src-tauri");

const rustVersion = execFileSync("rustc", ["-vV"], {
	cwd: rootDir,
	encoding: "utf8",
});
const targetTriple = rustVersion
	.split("\n")
	.find((line) => line.startsWith("host: "))
	?.replace("host: ", "")
	.trim();

if (!targetTriple) {
	throw new Error("Rustのターゲットを取得できませんでした。");
}

const isWindows = process.platform === "win32";
const executableName = isWindows ? "server_cli.exe" : "server_cli";
const sourcePath = join(tauriDir, "target", "release", executableName);
const binariesDir = join(tauriDir, "binaries");
const targetName = isWindows
	? `server_cli-${targetTriple}.exe`
	: `server_cli-${targetTriple}`;
const targetPath = join(binariesDir, targetName);

mkdirSync(binariesDir, { recursive: true });
if (!existsSync(targetPath)) {
	writeFileSync(targetPath, "");
}

execFileSync(
	"cargo",
	[
		"build",
		"--manifest-path",
		join(tauriDir, "Cargo.toml"),
		"--bin",
		"server_cli",
		"--release",
	],
	{
		cwd: rootDir,
		stdio: "inherit",
	},
);

copyFileSync(sourcePath, targetPath);
