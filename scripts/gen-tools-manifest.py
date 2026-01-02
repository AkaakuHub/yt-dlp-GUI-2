#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone


def github_json(url: str) -> dict:
    headers = {"User-Agent": "tools-manifest"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def resolve_final_url(url: str) -> str:
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    req = urllib.request.Request(url, headers={"User-Agent": "tools-manifest"})
    with opener.open(req, timeout=60) as r:
        return r.geturl()


def sha256_of_url(url: str) -> tuple[str, int]:
    h = hashlib.sha256()
    size = 0
    req = urllib.request.Request(url, headers={"User-Agent": "tools-manifest"})
    with urllib.request.urlopen(req, timeout=180) as r:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


def build_artifacts_ytdlp(release: dict) -> list[dict]:
    assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
    targets = [
        ("windows", "x86_64", "yt-dlp.exe"),
        ("windows", "aarch64", "yt-dlp_arm64.exe"),
        ("windows", "x86", "yt-dlp_x86.exe"),
        ("linux", "x86_64", "yt-dlp_linux"),
        ("linux", "aarch64", "yt-dlp_linux_aarch64"),
        ("macos", "x86_64", "yt-dlp_macos"),
        ("macos", "aarch64", "yt-dlp_macos"),
    ]
    artifacts = []
    for os_name, arch, filename in targets:
        url = assets.get(filename)
        if not url:
            raise RuntimeError(f"yt-dlp asset not found: {filename}")
        digest, size = sha256_of_url(url)
        artifacts.append(
            {
                "os": os_name,
                "arch": arch,
                "url": url,
                "sha256": digest,
                "sizeBytes": size,
                "filename": filename,
            }
        )
    return artifacts


def build_artifacts_deno_fixed(release: dict, tag: str) -> list[dict]:
    assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
    targets = [
        ("windows", "x86_64", "deno-x86_64-pc-windows-msvc.zip", True),
        ("windows", "aarch64", "deno-aarch64-pc-windows-msvc.zip", False),
        ("linux", "x86_64", "deno-x86_64-unknown-linux-gnu.zip", True),
        ("linux", "aarch64", "deno-aarch64-unknown-linux-gnu.zip", True),
        ("macos", "x86_64", "deno-x86_64-apple-darwin.zip", True),
        ("macos", "aarch64", "deno-aarch64-apple-darwin.zip", True),
    ]
    artifacts = []
    for os_name, arch, filename, required in targets:
        url = assets.get(filename)
        if not url:
            if required:
                raise RuntimeError(f"deno asset not found: {filename}")
            continue
        digest, size = sha256_of_url(url)
        artifacts.append(
            {
                "os": os_name,
                "arch": arch,
                "url": url,
                "sha256": digest,
                "sizeBytes": size,
                "filename": filename,
            }
        )
    return artifacts


def build_artifacts_ffmpeg_fixed() -> list[dict]:
    targets = [
        (
            "windows",
            "x86_64",
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2025-03-31-12-55/ffmpeg-n7.1.1-5-g276bd388f3-win64-lgpl-7.1.zip",
        ),
        (
            "windows",
            "aarch64",
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2025-03-31-12-55/ffmpeg-n7.1.1-5-g276bd388f3-winarm64-lgpl-7.1.zip",
        ),
        (
            "linux",
            "x86_64",
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2025-03-31-12-55/ffmpeg-n7.1.1-5-g276bd388f3-linux64-lgpl-7.1.tar.xz",
        ),
        (
            "linux",
            "aarch64",
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2025-03-31-12-55/ffmpeg-n7.1.1-5-g276bd388f3-linuxarm64-lgpl-7.1.tar.xz",
        ),
        (
            "macos",
            "aarch64",
            "https://ffmpeg.martin-riedl.de/download/macos/arm64/1741718137_N-118739-g0b097ed9f1/ffmpeg.zip",
        ),
        (
            "macos",
            "x86_64",
            "https://ffmpeg.martin-riedl.de/download/macos/amd64/1741719748_N-118739-g0b097ed9f1/ffmpeg.zip",
        ),
    ]

    artifacts = []
    for os_name, arch, url in targets:
        digest, size = sha256_of_url(url)
        filename = url.split("?")[0].rsplit("/", 1)[-1]
        artifacts.append(
            {
                "os": os_name,
                "arch": arch,
                "url": url,
                "sha256": digest,
                "sizeBytes": size,
                "filename": filename,
            }
        )
    return artifacts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="src-tauri/tools-manifest.json",
        help="Output path for tools-manifest.json",
    )
    parser.add_argument(
        "--input",
        default="src-tauri/tools-manifest.json",
        help="Input tools-manifest.json (used for update-only mode)",
    )
    parser.add_argument(
        "--update-yt-dlp-only",
        action="store_true",
        help="Update only yt-dlp and keep other tool entries as-is",
    )
    parser.add_argument(
        "--yt-dlp-tag",
        default="",
        help="Pin yt-dlp to a specific tag (e.g. 2025.12.08)",
    )
    args = parser.parse_args()

    if args.yt_dlp_tag:
        yt_rel = github_json(
            f"https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/{args.yt_dlp_tag}"
        )
    else:
        yt_rel = github_json("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
    yt_tag = yt_rel["tag_name"]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if args.update_yt_dlp_only:
        with open(args.input, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        manifest["schemaVersion"] = manifest.get("schemaVersion", 1)
        manifest["generatedAt"] = now
        tools = manifest.setdefault("tools", {})
        tools["yt-dlp"] = {
            "version": yt_tag,
            "release": {
                "tag": yt_tag,
                "htmlUrl": yt_rel.get("html_url"),
                "publishedAt": yt_rel.get("published_at"),
            },
            "source": {
                "repo": "yt-dlp/yt-dlp",
                "tagUrl": f"https://github.com/yt-dlp/yt-dlp/tree/{yt_tag}",
                "tarballUrl": f"https://github.com/yt-dlp/yt-dlp/tarball/{yt_tag}",
                "thirdPartyLicensesUrl": f"https://github.com/yt-dlp/yt-dlp/blob/{yt_tag}/THIRD_PARTY_LICENSES.txt",
            },
            "artifacts": build_artifacts_ytdlp(yt_rel),
        }
    else:
        deno_tag = "v2.6.0"
        deno_rel = github_json(
            f"https://api.github.com/repos/denoland/deno/releases/tags/{deno_tag}"
        )
        ff_tag = "autobuild-2025-03-31-12-55"

        manifest = {
            "schemaVersion": 1,
            "generatedAt": now,
            "tools": {
                "yt-dlp": {
                    "version": yt_tag,
                    "release": {
                        "tag": yt_tag,
                        "htmlUrl": yt_rel.get("html_url"),
                        "publishedAt": yt_rel.get("published_at"),
                    },
                    "source": {
                        "repo": "yt-dlp/yt-dlp",
                        "tagUrl": f"https://github.com/yt-dlp/yt-dlp/tree/{yt_tag}",
                        "tarballUrl": f"https://github.com/yt-dlp/yt-dlp/tarball/{yt_tag}",
                        "thirdPartyLicensesUrl": f"https://github.com/yt-dlp/yt-dlp/blob/{yt_tag}/THIRD_PARTY_LICENSES.txt",
                    },
                    "artifacts": build_artifacts_ytdlp(yt_rel),
                },
                "ffmpeg": {
                    "version": "7.1.1",
                    "release": {
                        "tag": ff_tag,
                        "htmlUrl": f"https://github.com/BtbN/FFmpeg-Builds/releases/tag/{ff_tag}",
                        "publishedAt": None,
                    },
                    "source": {
                        "repo": "BtbN/FFmpeg-Builds",
                        "tagUrl": f"https://github.com/BtbN/FFmpeg-Builds/tree/{ff_tag}",
                    },
                    "artifacts": build_artifacts_ffmpeg_fixed(),
                },
                "deno": {
                    "version": deno_tag,
                    "release": {
                        "tag": deno_tag,
                        "htmlUrl": deno_rel.get("html_url"),
                        "publishedAt": deno_rel.get("published_at"),
                    },
                    "source": {
                        "repo": "denoland/deno",
                        "tagUrl": f"https://github.com/denoland/deno/tree/{deno_tag}",
                        "tarballUrl": f"https://github.com/denoland/deno/tarball/{deno_tag}",
                    },
                    "artifacts": build_artifacts_deno_fixed(deno_rel, deno_tag),
                },
            },
        }

    output_path = args.output
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
