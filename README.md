# リードα 復習セレクター

リードαの復習問題を、章・分野・知識/思考・過去の正答状況から選ぶためのWebアプリです。

## 現在の方針

- ユーザーは4桁IDと誕生日でログインします。
- ブラウザ画面でCSVの読み込み・書き出しはしません。
- 記録や新規作成など、必要な操作のあとに自動でクラウド保存します。
- 学習データはブラウザ上で暗号化してからGitHubへ保存します。
- 結果の記録は履歴として積み上げ、問題一覧のコメントは直近のコメントで上書きします。
- 目次と問題の元データは `data.js` に入っています。

## 設定ファイルの管理

GitHubの接続先とトークンは、アプリ本体ではなく `config.js` で管理します。

1. `config.example.js` をコピーして `config.js` を作ります。
2. `config.js` の `owner`, `repo`, `branch`, `token` を設定します。
3. `config.js` は `.gitignore` に入っているので、通常のGit管理には含めません。

```js
window.LEAD_ALPHA_CONFIG = {
  github: {
    owner: "shimakaze41kt-create",
    repo: "readalpharestudy",
    branch: "main",
    token: "GitHub fine-grained token",
  },
};
```

注意: GitHub Pagesなどに `config.js` をアップロードすると、トークンは利用者から見える状態になります。自分だけで使う場合は簡単ですが、他人にも公開する場合はCloudflare Workersなどの中継サーバーにトークンを置く方式が安全です。

## 管理用CSV

アプリ画面ではCSVを扱いません。初期データを整理・確認するための管理用ファイルだけ残しています。

- `lead-alpha-toc-template.csv`: 目次。列は `編,分野,章,名前,ページ`
- `lead-alpha-template.csv`: 問題。列は `編,章,種類,名前,知の指定,考の指定,関連問題,回数,正解数,最終実施日,コメント`
- `csv-format.md`: 列の説明

問題同士の関係は、問題データ内の `関連問題` 列だけで管理します。
