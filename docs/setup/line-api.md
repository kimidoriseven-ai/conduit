# LINE Messaging API 設定

## 概要

フィードバック受信・投稿完了・エラーなどをLINEで通知する。  
LINE Notify は2025年3月31日に廃止済みのため、LINE Messaging API を使用。

## 通知タイミング

| イベント | 通知内容 |
|---------|---------|
| クライアントがフィードバック送信 | フィードバック受信の通知 |
| 全写真が承認された | 投稿予約確定の通知 |
| Instagram自動投稿が完了 | 投稿完了の通知 |
| Instagram自動投稿が失敗 | エラー通知 |
| Instagramトークンが5日以内に期限切れ | 更新アラート |

## セットアップ手順

### 1. LINE Official Account 作成

1. [LINE Official Account Manager](https://manager.line.biz/) にアクセス
2. アカウント作成（無料プランでOK）

### 2. LINE Developers でチャンネル作成

1. [LINE Developers Console](https://developers.line.biz/) を開く
2. プロバイダーを作成または選択
3. 「Messaging API」チャンネルを作成
4. チャンネル設定 → Messaging API タブ

### 3. チャンネルアクセストークン取得

1. LINE Developers → チャンネル → Messaging API タブ
2. 「チャンネルアクセストークン（長期）」の「発行」をクリック
3. 表示されたトークンをコピー

### 4. 管理画面に保存

1. https://conduit-app.com/admin/settings を開く
2. 「チャンネルアクセストークン」欄に貼り付け
3. 「トークンを保存する」をクリック

トークンは Firestore の `systemConfig/lineNotify.accessToken` に保存される。

### 5. 自分をフレンド登録

LINE Official Account に自分（管理者）がフレンド登録されていないと通知が届かない。  
LINE アプリで QR コードを読み取ってフレンド追加する。

## トークンの再発行

トークンが漏洩したり無効になった場合：
1. LINE Developers で新しいトークンを発行
2. 管理画面の設定ページで更新して保存

## 注意事項

- broadcast エンドポイントを使用（フレンド全員に送信）
- フレンド登録されていないと通知が届かない
- 通知が届かない場合は管理画面設定ページでトークンを再保存する
