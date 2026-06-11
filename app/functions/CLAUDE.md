# Cloud Functions デプロイ エラー対応

## 状況

Firebase Cloud Functions (gen2) のデプロイで以下のエラーが発生しています：

```
Error: There was an error deploying functions:
- Error Failed to create function notifyLineOnFeedback in region asia-northeast1
- Error Failed to create function onAllApproved in region asia-northeast1
- Error Failed to create function checkScheduledPosts in region asia-northeast1
```

`firebase deploy` は `C:\Users\admin\OneDrive\ドキュメント\Claude\Projects\Instagram投稿_確認アプリ\app` で実行。

## プロジェクト情報

- Firebase プロジェクトID: `instagram-post-confirm`
- リージョン: `asia-northeast1`（東京）
- Node バージョン: 20
- firebase-functions: v6（gen2）
- Blaze プランに変更済み、Cloud Build API・Cloud Functions API は有効化済み

## 実装内容（index.js）

4つの Cloud Functions:

1. `notifyLineOnFeedback` — Firestoreトリガー（projects ドキュメントの status が `feedback_received` に変わったとき LINE通知）
2. `onAllApproved` — Firestoreトリガー（status が `all_approved` に変わったとき LINE通知）
3. `checkScheduledPosts` — スケジューラー（5分ごと、投稿予定時刻を過ぎた all_approved 案件を Instagram投稿）
4. `refreshAccessTokens` — スケジューラー（毎日9:00 JST、Instagramトークンを自動更新）

## やってほしいこと

1. エラー原因を特定・修正してデプロイを成功させる
   - ログの詳細確認（`firebase functions:log` など）
   - 権限不足なら必要な IAM 設定を案内 or 実施
   - gen2 特有の問題（eventarc, run.googleapis.com 等）であれば対応

2. デプロイ成功を確認（`firebase deploy --only functions` が通ること）

## ファイル構成

```
app/
  firebase.json          # functions セクション含む
  firestore.indexes.json # 複合インデックス設定済み
  functions/
    package.json         # node 20, firebase-functions v6
    index.js             # 4関数の実装
```

## 補足

LINE通知は Firestore の `systemConfig/lineNotify.accessToken` からトークンを取得。
Instagram投稿は各プロジェクトドキュメントの `instagramAccessToken`・`instagramAccountId` を使用。
