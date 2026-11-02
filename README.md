# coronamng.store 恐喝サイトのプログラム（track.php・accounts.js）

2026 年 10 月、「お名前.com デスクトップクラウド」事案で GMO インターネットを恐喝した犯人のサイト（coronamng.store、Namecheap 198.54.116.91）に置かれていた PHP と JavaScript です。プログラムの技術検証のために公開しています。
調査の経緯は https://satoru.net/hacker/gmo/ を参照してください。

## 出どころ

2026-10-23 09:54 UTC に犯人がサイトのルートに置いた `source.zip`（1,354,131 バイト、SHA-256 `404c0ddd93ef31d4fbb8500303e9579b28009b92442e6666b08ba334d0aa4e99`。Wayback Machine 20261023103256 に同じものが保存されています）から取り出しました。
バイト列は zip 内と同じです（改行は CRLF のまま）。パスも zip 内と同じです。SHA-256 は `SHA256SUMS` にあります。

## track.php（訪問カウンター）

- 各ページに `<img src="track.php?p=index">` のように埋め込まれ、1×1 の透明 GIF を返します。
- そのとき、時刻・IP・IP のハッシュ・bot 判定・ページ名・UA・参照元を `data/logs/visits.log` にタブ区切りで 1 行ずつ書き、`visits.json` に集計します。
- IP は `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP` → `REMOTE_ADDR` の順に採用します。サイトは Cloudflare を通っていなかったので、閲覧者がヘッダーで任意の IP を記録させることができました。
- ハッシュの塩は既定値の `change-this-salt-please` のままでした。

## assets/accounts.js（表の表示）

- `data/accounts-2.xlsx` と `data/accounts.xlsx` を取得し、SheetJS（`XLSX`）で読み込んで、ファイルとシートごとに別の表として表示します。読み込めないときは `window.ACCOUNTS_DATA` を使い、それもなければファイルのドロップを求めます。
- 列名に「破壊」「金額」「残高」「usd」「jpy」などを含む列を合計列として選びます。該当がなければ、値の半分以上が数値の列を右から探します。
- 検索、並べ替え、CSV 出力、読み込んだデータを `accounts.js` として保存する機能があります。
- 通信は上記の xlsx の取得だけで、読み込んだデータを外部に送る処理はありません。
- SheetJS 本体とデータはこのファイルに含まれません。SheetJS は `accounts.html` が jsDelivr（xlsx@0.18.5）から読み込んでいました。

## 含めていないもの

このリポジトリは track.php・assets/accounts.js・README.md・SHA256SUMS・LICENSE だけです。

`source.zip` の xlsx、訪問ログ（`data/logs/`）、メールの画像、HTML は、個人情報や認証情報を含む、または含む可能性があるため入れていません。
