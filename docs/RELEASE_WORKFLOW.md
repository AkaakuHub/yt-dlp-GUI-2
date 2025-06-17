# GitHub Actions Release Workflow

このプロジェクトでは、自動化されたリリースワークフローを設定しています。

## ワークフローの概要

### 1. `tag-version.yml` - バージョンタグ作成
- **トリガー**: `release`ブランチへのプッシュ
- **機能**:
  - `src-tauri/Cargo.toml`からバージョンを自動抽出
  - 全ファイル（`Cargo.toml`, `tauri.conf.json`, `package.json`）でバージョンの整合性をチェック
  - `v1.0.5`形式のタグを自動作成・プッシュ
  - 既存タグがある場合はスキップ

### 2. `build.yml` - ビルドとリリース
- **トリガー**: バージョンタグ（`v*.*.*`）のプッシュ
- **機能**:
  - macOS (ARM/Intel), Ubuntu, Windows向けにビルド
  - GitHub Releaseを自動作成
  - アーティファクトのアップロード

### 3. `create-release-pr.yml` - プルリクエスト作成
- **トリガー**: リリースの公開
- **機能**:
  - `release`ブランチから`main`ブランチへのプルリクエストを自動作成

## 使用方法

### 方法1: ヘルパースクリプトを使用
```bash
# バージョンを更新（例：1.0.6）
./scripts/update-version.sh 1.0.6

# 変更を確認
git diff

# コミット・プッシュ
git add .
git commit -m "v1.0.6"
git push origin release
```

### 方法2: 手動更新
1. 以下のファイルでバージョンを更新:
   - `src-tauri/Cargo.toml` (version = "x.x.x")
   - `src-tauri/tauri.conf.json` ("version": "x.x.x")
   - `package.json` ("version": "x.x.x")

2. `release`ブランチにコミット・プッシュ:
```bash
git add .
git commit -m "vx.x.x"
git push origin release
```

## ワークフローの流れ

1. **開発者**: `release`ブランチにバージョン更新をプッシュ
2. **自動**: `tag-version.yml`がバージョンタグを作成
3. **自動**: `build.yml`がタグに反応してビルド・リリースを実行
4. **自動**: `create-release-pr.yml`がリリース後にプルリクエストを作成

## 必要な設定

以下のシークレットが設定されている必要があります：
- `BUILD_SECRET_KEY`: Tauriのプライベートキー
- `BUILD_PASSWORD`: Tauriキーのパスワード

## 注意事項

- 全バージョンファイルで整合性が取れていない場合、ワークフローは失敗します
- 既存のタグと同じバージョンの場合、タグ作成はスキップされます
- リリースブランチでのみ動作します
