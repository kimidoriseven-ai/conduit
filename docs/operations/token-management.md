# トークン管理

## Instagram アクセストークン

### 概要

アクセストークンは **OAuth連携フローによって自動取得・自動保存** される。手動でトークンを貼り付ける操作は原則不要（旧方式は予備として管理画面に残置）。

トークンはアカウントごとに `instagramAccounts/{igUserId}` に保存され、Cloud Function が毎日自動更新する。

### 有効期限

- Long-lived token: **60日間**
- 最終使用から60日経過すると失効

### 自動更新の仕組み

- Cloud Function `refreshAccessTokens` が毎日 AM 9:00（JST）に実行
- 旧 `systemConfig/instagram` と `instagramAccounts` 全件が対象
- 有効期限まで**5日以内**になると自動更新
- 更新後、新しいトークンと有効期限を Firestore に保存
- 失敗時はアカウント名つきで LINE 通知が届く

### トークンが失効した場合（再連携手順）

トークンが失効してしまった場合（60日間まったく投稿がなかったなど）:

1. 管理画面 → システム設定 → **Instagram連携** → 「連携リンクを発行」
2. リンクをクライアントに送付し、再度 Instagram ログインして許可
3. 連携済み一覧に @ユーザー名 が再表示されれば完了（旧トークンは上書きされる）

> **「ログイン画面を必ず表示する」チェック（force_reauth）を使うと**、すでにログイン済みの端末でもログイン画面を強制表示できるため、自分のスマートフォンから代理で再連携する場合にも使えます。

### トークン失効のサイン

- ステータスが「エラー」になる
- LINE に「投稿失敗」または「Instagram連携が切れています」通知が届く
- Cloud Functions のログに認証エラーが記録される

### （予備）手動設定

Graph API Explorer でトークンを手動取得して貼り付ける旧方式は、管理画面 → システム設定 →「Instagram手動設定（旧方式）」から引き続き利用可能。詳細手順は [docs/setup/instagram-api.md](../setup/instagram-api.md) の末尾を参照。

---

## LINE Messaging API トークン

### 概要

- チャンネルアクセストークン（長期）: **有効期限なし**
- 自動更新不要

### 更新手順（漏洩・無効化時）

1. [LINE Developers Console](https://developers.line.biz/) にアクセス
2. Messaging API チャンネル → 「チャンネルアクセストークン」で新規発行
3. 管理画面 → システム設定 (https://conduit-app.com/admin/settings) で保存

---

## Firebase Auth トークン（管理者ログイン）

パスワードを忘れた場合は Firebase Console → Authentication → ユーザー からリセット。
