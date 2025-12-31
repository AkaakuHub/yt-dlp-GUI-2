<div style="display: flex; gap: 10px">
<img src="https://shields.io/badge/Windows--9cf?logo=Windows&style=social"> ◎
<img src="https://shields.io/badge/macOS--9cf?logo=Apple&style=social">◎
<img src="https://shields.io/badge/Linux--9cf?logo=Linux&style=social">未検証
</div>

# yt-dlp-GUI

#### このアプリケーションの使用により生じる一切の責任を負いません。

#### I don't take any responsibility caused by using this application.

## 推奨拡張機能(WIP)

https://github.com/AkaakuHub/YDG-Helper

## インストール

### Windows

1.[**ここ**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest)から、
`yt-dlp-GUI_x.x.x_x64_ja-JP.msi`(推奨)か、
`yt-dlp-GUI_x.x.x_x64-setup.exe`をダウンロードする。

2.[**ここ**](https://github.com/yt-dlp/yt-dlp/releases)にある最新バージョンのリリース("Latest"と書いてあるもの)から
`yt-dlp.exe`
をダウンロードし、それをユーザーディレクトリ(例.Windowsの場合、C:\\Users\\ユーザー名\\
)に移動する。<br/>

3.[**ここ**](https://github.com/yt-dlp/FFmpeg-Builds/releases/)にある最新バージョンのリリース("Latest"と書いてあるもの)から
`ffmpeg-master-latest-win64-gpl.zip`
をダウンロードし、展開してから、
`ffmpeg.exe`と`ffprobe.exe`
を2番と同じユーザーディレクトリに移動する。<br/>

4.[**こちら**](#トラブルシューティング)の手順に従い、パスを通す。

5.なんらかの方法で`deno`をインストールする。

### Mac

1.[**ここ**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest)にある最新バージョンのリリース("Latest"と書いてあるもの)から
`yt-dlp-GUI_x.x.x_aarch64.dmg`
をダウンロードする。

2.ダブルクリックすると、このような画面が開くので、右のアイコンを左にドラッグアンドドロップする。
   ![image](https://github.com/user-attachments/assets/5e7805aa-4ad8-49e9-9eba-d154554378fb)

3.`"yt-dlp-GUI.app"は壊れているため開けません。`
と表示される場合は、ターミナルで`xattr -rc [appファイルのパス]`を実行する。<br/>
例: `xattr -rc /Applications/yt-dlp-GUI.app`

4.ffmpegとyt-dlpをインストールする。(homebrew推奨)

5.なんらかの方法で`deno`をインストールする。

### Linux

WIP

## 使い方

推奨拡張機能を導入するとより便利になります。
通常の使用方法は、URLをコピーしたら大きい右のボタンを押すと実行できます。<br>

### おまけ

まず、「リストを表示」を実行して、コーデックIDの一覧を取得します。次に、希望のコーデックIDを入力し、「リストからコーデックIDを指定」を実行します。

- 例1: 140番がほしい → `140`
- 例2: 140番と270番をまとめて1つのファイルでほしい → `140+270`

また、コーデックIDは優先順位をつけて書くことも出来ます。

- 例: `247+251/136+140/22+43/382+385/398+401/298+300/612+614`

## ライセンスとソース提供（GPL対応）

- 本アプリは配布物に含まれる外部ツール（yt-dlp / FFmpeg / deno）について、**各リリースごとに固定された情報**を `tools-manifest.json` に記録しています。
- `tools-manifest.json` には **バイナリのURL・バージョン・sha256・対応するソースURL** を記載しており、配布されたバイナリと対応ソースを 1:1 で結び付けられるようにしています。
- これにより、GPLで要求される **Corresponding Source への同等アクセス** を満たす運用を行っています。
- yt-dlp については **THIRD_PARTY_LICENSES.txt（第三者ライセンス一覧）** があるため、`tools-manifest.json` から該当ファイルへの導線も提供しています。

## トラブルシューティング

### Microsoft Defenderに怒られる

個人開発ソフトのため、発行元が不明となってしまうのが原因です。不安で本ソフトを信頼しない場合は、使用しないでください。

### 「yt-dlp/ffmpegがインストールされていないか、パスが通っていません。表示される手順に従ってパスを通してください。」と表示される

まず、インストール手順に従ってダウンロードしているか確認してください。

ユーザーディレクトリにyt-dlpやffmpegなどのexeがあるのにエラーが出る場合は、以下の手順に従って、パスを通してください。

1. Windowsマークを押し、検索欄に「環境変数」と入力し、「環境変数を編集」を実行する。

2. 上半分側で、1列目の変数が「Path」となっている部分をダブルクリックする。

3. 「環境変数名の編集」のウィンドウが開いたら、「新規」をクリックして、以下のように入力する。<br/>例：ユーザー名が「guest」の場合、`C:\Users\guest`

4. 「OK」を2回押してウィンドウを閉じる。
