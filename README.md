# Conduit — Instagram投稿確認アプリ

Instagram投稿代行サービスのための、投稿確認・承認・自動投稿アプリ。

> 📌 本リポジトリは実運用中アプリの**公開用スナップショット**です。クライアントのプライバシー保護のため、実写真を含む操作マニュアル・スクリーンショット類は除外しています。

投稿予定の写真をクライアントがスマホで確認し、OK/NG・手書き書き込み・差し替え指示をワンタップでフィードバック。全員の承認が揃ったら、設定日時にInstagramへ自動でカルーセル投稿します。

## 本番URL

- **カスタムドメイン**: https://conduit-app.com
- **Firebase Hosting**: https://instagram-post-confirm.web.app

## 特徴

### クライアント側（確認ページ・ログイン不要）

- LINEで受け取ったURLを開くだけ。名前を入力して確認を開始
- **複数人での確認に対応** — 誰が確認済みか、他の確認者がどんなフィードバック（OK/NG・コメント・差し替え希望）を送ったかをその場で閲覧できる
- 写真ごとにOK / NGをワンタップ判定、進捗バーで残り枚数を表示
- 気になる箇所は**写真に指で直接書き込み**（Canvas API・ペン/丸・赤/白）
- NG写真には差し替え候補をタップで指定
- キャプション・ハッシュタグの直接修正、全体コメント
- ITリテラシーを問わないUI設計（大きなボタン・専門用語なし・最大3ステップ）

### 業者側（管理画面・Google認証）

- 案件作成ウィザード（写真アップロード → キャプション → 日時・URL発行の3ステップ）
- 写真は**アップロード時に自動圧縮**（本体1440px / サムネイル800px・JPEG）
- 確認URLのワンタップ発行・コピー・LINE共有（有効期限つき）
- フィードバックを確認者ごと・ラウンドごとにリアルタイム表示
- 修正版の再アップロード → 同じURLで再確認依頼
- Instagram連携・LINE通知トークンの管理画面

### 自動化（Cloud Functions）

- フィードバック受信・全承認・投稿完了・エラーを**LINEへPush通知**（LINE Messaging API）
- 全承認後、設定日時に**Instagram Graph APIでカルーセル自動投稿**（5分間隔のスケジューラ）
- Instagramアクセストークンの自動リフレッシュ（期限5日前・毎朝9時チェック）

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 18 + Vite（ルート単位のコード分割） |
| バックエンド | Firebase Cloud Functions（Node.js, Gen2, 東京リージョン） |
| データベース | Firestore |
| ストレージ | Firebase Storage |
| 認証 | Firebase Auth（Google・管理者アカウントのみ許可） |
| 通知 | LINE Messaging API |
| 投稿 | Instagram Graph API v21.0 |
| ホスティング | Firebase Hosting |

## セキュリティ設計

- クライアントはログイン不要。**推測不能なUUIDトークンつきURL**（有効期限あり）がアクセス境界
- トークン→案件IDの解決は `confirmLinks/{token}` の単一ドキュメントget（コレクションのlistはルールで禁止し、案件の列挙を防止）
- 管理者判定はFirestore/Storageルール・Cloud Functionsの3層すべてで**特定アカウントのみ**に限定
- クライアントが書き込めるのはフィードバック送信に必要なフィールドのみ（ルールで`affectedKeys`を制限）
- 手書き画像のアップロードはPNG・5MB未満に制限

## データモデル（Firestore）

```
projects/{projectId}                 … 1案件 = 1カルーセル投稿
  ├── caption / hashtags / defaultScheduledAt / status / confirmToken
  ├── photos/{photoId}               … type: main | alternative, order, storageUrl, thumbnailUrl
  └── feedbackRounds/{roundId}       … 確認者ごとの送信履歴
        ├── reviewerName / submittedAt / round
        ├── approvedCount / rejectedCount / overallComment
        └── photoFeedbacks: { [photoId]: { status, comment, drawingStorageUrl, replaceWithPhotoId } }

confirmLinks/{token}                 … 確認URLトークン → projectId のルックアップ
systemConfig/{instagram | lineNotify} … APIトークン（管理者のみアクセス可）
```

## 開発・デプロイ

```bash
cd app
npm install
npm run dev        # ローカル開発（Vite）

npm run build
firebase deploy --only hosting                    # フロントエンド
firebase deploy --only firestore:rules,storage    # セキュリティルール
firebase deploy --only functions                  # Cloud Functions
```

## ドキュメント

- [要件定義書](要件定義書_写真確認WEBアプリ.md)
- [Firestoreデータモデル設計書](Firestore_データモデル設計書.md)
- [Cloud Functions設計書](CloudFunctions_設計書.md)
- [アーキテクチャ・運用ドキュメント](docs/)（クライアント向けマニュアルはプライバシー保護のため非公開）
