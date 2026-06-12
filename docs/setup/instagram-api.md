# Instagram API 設定

## 概要

クライアントのInstagram Businessアカウントへ代理投稿するため、アカウントごとのアクセストークンが必要。

> **動作確認済み（2026-06-13）：** OAuth連携・実投稿まで本番環境で動作確認完了。

取得方法は2つ：

| 方式 | 状態 |
|------|------|
| **OAuth連携（推奨）** — 管理画面から連携リンクを発行し、クライアントがログインするだけ | 本ドキュメントのメイン手順 |
| 手動設定（旧方式） — Graph API Explorerでトークンを取得して貼り付け | 予備（ページ末尾に残置） |

## OAuth連携のセットアップ（初回のみ・Metaダッシュボード）

アプリは**開発モード**のまま運用する。連携できるのは「Instagramテスター」に登録したアカウントだけなので、アプリ審査は不要（不特定多数に使わせる場合のみ審査＝Advanced Accessが必要）。

### 1. Metaアプリ側の設定

1. [Meta for Developers](https://developers.facebook.com/apps/) → 対象アプリ → **Instagram > API setup with Instagram login**
2. **Instagram App ID** と **Instagram App Secret** を控える（FacebookアプリのIDとは別物なので注意）
3. **OAuth Redirect URIs** に以下を登録：
   ```
   https://conduit-app.com/instagram/callback
   ```

### 2. サーバー側の設定（デプロイ前に1回）

```bash
cd app

# App ID（秘密ではない）: functions/.env に記載
#   INSTAGRAM_APP_ID=（InstagramアプリID）
# ※ .env はgit管理外。クローンし直した場合は再作成すること

# App Secret（秘密）: Functions Secrets に登録（値はプロンプトで入力）
firebase functions:secrets:set INSTAGRAM_APP_SECRET

firebase deploy --only functions
```

### 3. 連携するアカウントをテスターに追加（アカウントごとに初回のみ）

1. Metaアプリ → **App roles > Roles** → **Add People** → **Instagram Tester** → クライアントのInstagramユーザー名を入力して招待
2. クライアント側：Instagramアプリ → 設定 → **アプリとウェブサイト** → **テスター招待** → 承認

### 4. 連携の実行

1. 管理画面 → システム設定 → **Instagram連携** → 「連携リンクを発行」
2. リンクをLINE等でクライアントへ送付（**有効期限30分・1回限り**）
3. クライアントがリンクを開き、Instagramにログインして許可 → 「連携完了🎉」と表示されたら完了
4. システム設定の連携済み一覧に @ユーザー名 が表示される

> **「ログイン画面を必ず表示する」チェック（force_reauth）：** このオプションを有効にしてリンクを発行すると、すでにログイン済みの端末でもInstagramのログイン画面が強制的に表示されます。自分のスマートフォンから別クライアントのアカウントを選んで連携したい場合などに使用してください。

## 仕組み（実装メモ）

- 連携リンク発行: Callable `createInstagramConnectLink`（管理者のみ）。ワンタイムstateを `oauthStates/{state}` に発行
- コールバック: `/instagram/callback`（公開ページ）→ Callable `completeInstagramOAuth` がstateを検証・消費し、code→短期→長期トークン交換、`instagramAccounts/{igUserId}` に保存
- App Secret は Functions Secrets（`INSTAGRAM_APP_SECRET`）のみに存在。フロントには出ない
- 投稿時の認証情報解決順序: 案件の `instagramAccountId` → 連携アカウントが1件ならそれ → 旧 `systemConfig/instagram`
- 案件作成画面は連携アカウントが2件以上のとき投稿先セレクトを表示
- 投稿 API は `graph.instagram.com/v21.0/me/media`。パラメータは**フォーム形式（application/x-www-form-urlencoded）**で送信する（JSONボディ＋アカウントID指定は OAuthException code 2 の原因となるため使用しない）

## トークン自動更新

- Cloud Function `refreshAccessTokens` が毎日9:00 JSTに実行
- 旧 `systemConfig/instagram` と `instagramAccounts` 全件が対象。有効期限まで5日以内のものを更新
- 失敗時はアカウント名つきでLINE通知が届く
- 60日間APIが使用されないと失効する点は従来どおり

## （予備）手動設定 — 旧方式

<details>
<summary>Graph API Explorer でトークンを取得して手動登録する手順</summary>

1. [Graph API Explorer](https://developers.facebook.com/tools/explorer/) でアプリを選択し、対象アカウントで認証（スコープ: `instagram_business_basic`, `instagram_business_content_publish`）
2. 短期トークンを長期トークンに変換：
   ```
   GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={app-secret}&access_token={short-lived-token}
   ```
3. アカウントID取得：
   ```
   GET https://graph.instagram.com/me?fields=user_id,username&access_token={token}
   ```
4. 管理画面 → システム設定 → 「Instagram手動設定（旧方式）」に ID とトークンを入力して保存

</details>
