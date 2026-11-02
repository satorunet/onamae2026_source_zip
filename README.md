# coronamng.store 恐喝サイトのプログラム（track.php・accounts.js 2 版）

2026 年 10 月、「お名前.com デスクトップクラウド」事案で GMO インターネットを恐喝した犯人のサイト（coronamng.store、Namecheap 198.54.116.91）に置かれていた PHP と JavaScript です。プログラムの技術検証のために公開しています。
調査の経緯は https://satoru.net/hacker/gmo/ を参照してください。

## 出どころ

2026-10-23 09:54 UTC に犯人がサイトのルートに置いた `source.zip`（1,354,131 バイト、SHA-256 `404c0ddd93ef31d4fbb8500303e9579b28009b92442e6666b08ba334d0aa4e99`。Wayback Machine 20261023103256 に同じものが保存されています）から取り出しました。
`track.php` と `assets/accounts.js` はこの zip から取り出したもので、バイト列とパスは zip 内と同じです（改行は CRLF のまま）。

`20261024/assets/accounts.js` は、サイトが .php 版で再公開された後の新版です。Wayback Machine の https://web.archive.org/web/20261024041139/https://coronamng.store/assets/accounts.js?v=8 （2026-10-24 04:11 UTC、サーバーの最終更新は 2026-10-23 16:03 UTC）から保存した時のものです。

SHA-256 は `SHA256SUMS` にあります。

## track.php（訪問カウンター）

- 各ページに `<img src="track.php?p=index">` のように埋め込まれ、1×1 の透明 GIF を返します。
- そのとき、時刻・IP・IP のハッシュ・bot 判定・ページ名・UA・参照元を `data/logs/visits.log` にタブ区切りで 1 行ずつ書き、`visits.json` に集計します。
- IP は `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP` → `REMOTE_ADDR` の順に採用します。サイトは Cloudflare を通っていなかったので、閲覧者がヘッダーで任意の IP を記録させることができました。
- ハッシュの塩は既定値の `change-this-salt-please` のままでした。

## assets/accounts.js（表の表示、zip の版）

- `data/accounts-2.xlsx` と `data/accounts.xlsx` を取得し、SheetJS（`XLSX`）で読み込んで、ファイルとシートごとに別の表として表示します。読み込めないときは `window.ACCOUNTS_DATA` を使い、それもなければファイルのドロップを求めます。
- 列名に「破壊」「金額」「残高」「usd」「jpy」などを含む列を合計列として選びます。該当がなければ、値の半分以上が数値の列を右から探します。
- 検索、並べ替え、CSV 出力、読み込んだデータを `accounts.js` として保存する機能があります。
- 通信は上記の xlsx の取得だけで、読み込んだデータを外部に送る処理はありません。
- SheetJS 本体とデータはこのファイルに含まれません。SheetJS は `accounts.html` が jsDelivr（xlsx@0.18.5）から読み込んでいました。

## 20261024/assets/accounts.js（表の表示、?v=8 の版）

- xlsx の読み込みをやめ、ページ内の `<script id="accounts-data" type="application/json">` に PHP が埋め込んだ JSON を描画するだけになりました。
- 先頭のコメントに、解析はバックエンドの `lib/xlsx.php` で行うと書かれています。
- ドロップでの読み込みと `accounts.js` の保存機能はなくなり、検索、並べ替え、CSV 出力は残っています。
- この版は通信をしません。

## 含めていないもの

このリポジトリは track.php・assets/accounts.js・20261024/assets/accounts.js・README.md・SHA256SUMS だけです。

`source.zip` の xlsx、訪問ログ（`data/logs/`）、メールの画像、HTML は、個人情報や認証情報を含む、または含む可能性があるため入れていません。`accounts-data` の JSON も同じ理由で入れていません。

次のものも入っていません。

- SheetJS（`xlsx.full.min.js`）：第三者のライブラリです。保存したファイルは jsDelivr の xlsx@0.18.5 と同じものでした。
- `/_autoindex/` の `tablesort.js` など：サーバーのディレクトリ一覧の部品で、保存していません。
- `index.php`、`accounts.php`、`lib/xlsx.php` などの .php 版のソース：サーバー側で実行されるため、出力された HTML しか取得できていません。

## ライセンス

`track.php` と 2 つの `accounts.js` は第三者のコードをそのまま保存したもので、ライセンスは付与していません。
