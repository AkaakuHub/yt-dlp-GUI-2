# GitHub Actions Release Workflow

このプロジェクトは`release`ブランチを使いません。

## ワークフロー

### `build.yml`

- **トリガー**:`v*`形式のタグpush、または手動実行
- **処理**:
  - macOS(ARM/Intel)、Ubuntu、Windows向けにビルド
  - GitHub Releaseを作成
  - `tools-manifest.json`をRelease assetへアップロード

## リリース手順

```bash
./scripts/update-version.sh 2.0.0
```

このスクリプトは`main`ブランチ上でだけ実行できます。

1. `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json`、`package.json`のversionを更新します。
2. `v2.0.0`形式でcommitします。
3. `v2.0.0`形式のannotated tagを作成します。
4. `main`とtagをpushします。
5. tag pushに反応して`build.yml`が走ります。

## 必要なGitHub Secrets

- `BUILD_SECRET_KEY`:Tauriのプライベートキー
- `BUILD_PASSWORD`:Tauriキーのパスワード

## 再実行

既存タグでビルドを再実行する場合は、対象のタグを作り直します。

```bash
./scripts/retag.sh 2.0.0
```

## 注意事項

- `release`ブランチは使いません。
- 既存のタグと同じバージョンでは`update-version.sh`は停止します。
- バージョンファイルだけをCI内で更新する場合は、`CI=1`を設定して`update-version.sh`を実行します。
