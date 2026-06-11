# トークン管理

## Instagram アクセストークン

### 有効期限
- Long-lived token: **60日間**
- 最終使用から60日経過すると失効

### 自動更新の仕組み
- Cloud Function `refreshAccessTokens` が毎日実行
- 有効期限まで**5日以内**になると自動更新
- 更新後、新しいトークンと有効期限をFirestoreに保存
- 更新成功・失敗時にLINE通知が届く

### 手動更新が必要な場合
トークンが失効してしまった場合（60日間まったく投稿がなかったなど）:

1. [Meta for Developers](https://developers.facebook.com/tools/explorer/) でクライアントアカウントとして再認証
2. 新しいトークンを取得（Long-lived tokenに変換）
3. 管理画面のプロジェクト詳細ページ → Instagram設定 で更新

### トークン失効のサイン
- ステータスが「エラー」になる
- LINEに「投稿失敗」通知が届く
- Cloud Functionsのログに認証エラーが記録される

## LINE Messaging API トークン

### 概要
- チャンネルアクセストークン（長期）: **有効期限なし**
- 自動更新不要

### 更新手順（漏洩・無効化時）
1. [LINE Developers Console](https://developers.line.biz/) にアクセス
2. Messaging API チャンネル → 「チャンネルアクセストークン」で新規発行
3. 管理画面 → システム設定 (https://conduit-app.com/admin/settings) で保存

## Firebase Auth トークン（管理者ログイン）

パスワードを忘れた場合は Firebase Console → Authentication → ユーザー からリセット。
