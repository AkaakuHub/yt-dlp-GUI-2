<div style="display: flex; gap: 10px">
<img src="https://shields.io/badge/Windows--9cf?logo=Windows&style=social"> ◎
<img src="https://shields.io/badge/macOS--9cf?logo=Apple&style=social">WIP
<img src="https://shields.io/badge/Linux--9cf?logo=Linux&style=social">WIP
</div>

# yt-dlp-GUI

#### このアプリケーションの使用により生じる一切の責任を負いません。

#### I don't take any responsibility caused by using this application.

## 推奨拡張機能(WIP)

https://github.com/AkaakuHub/YDG-Helper

## インストール

### Windows

1.[**ここ(推奨)**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest/download/yt-dlp-GUI_1.0.0_x64_ja-JP.msi)か、[**ここ**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest/download/yt-dlp-GUI_1.0.0_x64-setup.exe)をクリックしてダウンロードする。

2.[**ここ**](https://github.com/yt-dlp/yt-dlp/releases)にある最新バージョンのリリース("Latest"と書いてあるもの)から
`yt-dlp.exe`
をダウンロードし、それをユーザーディレクトリ(例.Windowsの場合、C:\\Users\\ユーザー名\\
)に移動する。<br/>

3.[**ここ**](https://github.com/yt-dlp/FFmpeg-Builds/releases/)にある最新バージョンのリリース("Latest"と書いてあるもの)から
`ffmpeg-master-latest-win64-gpl.zip`
をダウンロードし、展開してから、
`ffmpeg.exe`と`ffprobe.exe`
を2番と同じユーザーディレクトリに移動する。<br/>

4.[**こちら**](###「yt-dlp/ffmpegがインストールされていないか、パスが通っていません。表示される手順に従ってパスを通してください。」と表示される)の手順に従い、パスを通す。

### Mac

1.自分のアーキテクチャにあったバイナリ([**Intelチップ**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest/download/yt-dlp-GUI_x64.app.tar.gz)または[**M1/M2チップ**](https://github.com/AkaakuHub/yt-dlp-GUI-2/releases/latest/download/yt-dlp-GUI_1.0.1_aarch64.dmg))をダウンロードする。

2.ffmpegとyt-dlpをインストールする。(brew推奨)

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
