# coronamng.store 恐喝サイトの訪問カウンター（track.php）

2026 年 10 月、「お名前.com デスクトップクラウド」事案で GMO インターネットを恐喝した犯人のサイト（coronamng.store、Namecheap 198.54.116.91）に置かれていた訪問カウンターです。
調査の経緯は https://satoru.net/hacker/gmo/ を参照してください。

## 出どころ

2026-10-23 09:54 UTC に犯人がサイトのルートに置いた `source.zip`（1,354,131 バイト、SHA-256 `404c0ddd93ef31d4fbb8500303e9579b28009b92442e6666b08ba334d0aa4e99`。Wayback Machine 20261023103256 に同じものが保存されています）から取り出しました。
バイト列は zip 内と同じです（改行は CRLF のまま）。SHA-256 は `SHA256SUMS` にあります。

## 動き

- 各ページに `<img src="track.php?p=index">` のように埋め込まれ、1×1 の透明 GIF を返します。
- そのとき、時刻・IP・IP のハッシュ・bot 判定・ページ名・UA・参照元を `data/logs/visits.log` にタブ区切りで 1 行ずつ書き、`visits.json` に集計します。
- IP は `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP` → `REMOTE_ADDR` の順に採用します。サイトは Cloudflare を通っていなかったので、閲覧者がヘッダーで任意の IP を記録させることができました。
- ハッシュの塩は既定値の `change-this-salt-please` のままでした。

このリポジトリは track.php・README.md・SHA256SUMS の 3 ファイルだけで、個人情報は含みません。
