# システム概要

## サービス構造

```
管理者（管理者・代行業者）
  │
  ├─ 管理画面（/admin）でプロジェクトを作成・管理
  │
  ├─ クライアントAのInstagram Businessアカウントへ代理投稿
  ├─ クライアントBのInstagram Businessアカウントへ代理投稿
  └─ クライアントC…
```

## ワークフロー

```
[管理者] プロジェクト作成
         写真・キャプション・ハッシュタグをアップロード
         確認URLをクライアントに送付
         ↓
[クライアント] URLを開く（ログイン不要）
              写真をスワイプして OK / NG を選択
              フィードバックを送信
              ↓
[管理者] フィードバック内容を確認
         NGがある場合 → 修正して再依頼
         全OK → 自動投稿がスケジュールされる
              ↓
[Cloud Functions] スケジュール時刻になったら
                 Instagram Graph APIで投稿
                 LINE通知を送信
```

## 技術スタック

| レイヤー | 技術 | 備考 |
|----------|------|------|
| フロントエンド | React 18 + Vite | maxWidth 480px モバイルファースト |
| ホスティング | Firebase Hosting | conduit-app.com |
| データベース | Cloud Firestore | |
| ストレージ | Firebase Storage | 写真・サムネイル |
| バックエンド | Cloud Functions Gen2 | Node.js 22, firebase-functions v7 |
| 認証 | Firebase Auth | 管理者1名のみ（メール/パスワード） |
| 外部API | Instagram Graph API v21.0 | graph.instagram.com |
| 通知 | LINE Messaging API | broadcast エンドポイント |
| スケジューラ | Cloud Scheduler | 5分間隔で投稿チェック |

## Cloud Functions 一覧

| 関数名 | トリガー | 役割 |
|--------|----------|------|
| `checkAndPost` | 5分間隔（Scheduler） | 予約時刻になった案件をInstagramに投稿 |
| `refreshAccessTokens` | 毎日（Scheduler） | 期限5日以内のInstagramトークンを更新（旧設定＋instagramAccounts全件対象） |
| `sendLineNotification` | Firestore onWrite | プロジェクト状態変化時にLINE通知 |
| `createInstagramConnectLink` | Callable（管理者のみ） | OAuthワンタイムstate発行・認可URLを返す |
| `completeInstagramOAuth` | Callable（認証不要） | state検証・code→トークン交換・instagramAccountsに保存 |

## Instagram OAuth連携フロー（2026-06-13）

Metaアプリは開発モードのまま運用する。連携するアカウントはあらかじめ「Instagramテスター」に登録しておく（アプリ審査不要）。

```
[管理者] Metaアプリ管理画面でクライアントを「Instagramテスター」に招待
         ↓ クライアントがInstagramアプリで招待を承認
[管理者] 管理画面 → システム設定 → 「連携リンクを発行」
         Cloud Function createInstagramConnectLink がワンタイムstate（30分・1回限り）を
         oauthStates/{state} に保存し、Instagram OAuth認可URLを返す
         ↓ リンクをLINE等でクライアントに送付
[クライアント] リンクを開き、Instagramにログインして許可
         ↓
[/instagram/callback] Cloud Function completeInstagramOAuth を呼び出す
         stateをトランザクションで検証・消費
         code → 短期トークン → 長期トークン交換
         instagramAccounts/{igUserId} に保存 → 「連携完了」と表示
         ↓
[Cloud Function refreshAccessTokens] 毎日 AM9:00 に自動リフレッシュ（期限5日前）
```

## URLルーティング

| パス | 対象 | 認証 |
|------|------|------|
| `/admin` | 管理ダッシュボード | 要ログイン |
| `/admin/projects/new` | プロジェクト作成 | 要ログイン |
| `/admin/projects/:id` | プロジェクト詳細 | 要ログイン |
| `/admin/projects/:id/feedback` | フィードバック詳細 | 要ログイン |
| `/admin/settings` | システム設定 | 要ログイン |
| `/confirm/:token` | クライアント確認ページ | 不要（URLがトークン） |
| `/confirm/:token/complete` | 送信完了ページ | 不要 |
