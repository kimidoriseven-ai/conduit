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
| `refreshAccessTokens` | 毎日（Scheduler） | 期限5日以内のInstagramトークンを更新 |
| `sendLineNotification` | Firestore onWrite | プロジェクト状態変化時にLINE通知 |

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
