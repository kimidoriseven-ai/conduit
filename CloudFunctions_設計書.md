# Cloud Functions 処理フロー設計書
## Instagram投稿確認WEBアプリ

**バージョン：** 1.0  
**作成日：** 2026-05-16

---

## 1. Cloud Functions 一覧

| 関数名 | トリガー | 役割 |
|--------|---------|------|
| `getProjectByToken` | HTTPS呼び出し | クライアント確認ページのデータ取得 |
| `submitFeedback` | HTTPS呼び出し | フィードバック送信処理 |
| `scheduleInstagramPosts` | Firestore トリガー | 全承認時に予約投稿をスケジュール |
| `postToInstagram` | Cloud Scheduler | 指定日時に Instagram へ投稿 |
| `refreshAccessTokens` | Cloud Scheduler（毎日） | 期限切れ前のトークンを自動更新 |
| `notifyLineOnFeedback` | Firestore トリガー | フィードバック受信時にLINE通知 |

---

## 2. 関数詳細

### 2.1 `getProjectByToken` — HTTPS

クライアントが確認URLを開いたときに呼ばれる。  
confirmToken を検証して写真・キャプションデータを返す。

**エンドポイント：** `GET /getProjectByToken?token={confirmToken}`

**処理フロー：**
```
① confirmToken を受け取る
② Firestore: projects コレクションを confirmToken で検索
③ 見つからない → 404 エラー（「URLが無効です」）
④ confirmTokenExpiresAt < now → 410 エラー（「URLの有効期限が切れています」）
⑤ Firestoreから photos サブコレクション（type: "main" のみ）を order 順で取得
⑥ alternativePhotoIds から差し替え候補写真も取得
⑦ 最新の feedbackRounds（currentRound）を取得（再確認時の前回フィードバック表示用）
⑧ レスポンス（accessToken は含めない）：
   {
     projectId, clientName（showClientNameがtrueの場合のみ）,
     caption, hashtags, currentRound,
     photos: [{ id, thumbnailUrl, order, currentStatus,
                linkedAlternativeIds, previousFeedback }],
     previousOverallComment
   }
```

---

### 2.2 `submitFeedback` — HTTPS

クライアントが「送信する」を押したときに呼ばれる。

**エンドポイント：** `POST /submitFeedback`

**リクエストボディ：**
```json
{
  "confirmToken": "550e8400-...",
  "overallComment": "全体的にいい感じです",
  "photoFeedbacks": {
    "photoId_1": {
      "status": "ok",
      "comment": "",
      "drawingDataUrl": null,
      "captionEdit": null,
      "replaceWithPhotoId": null
    },
    "photoId_2": {
      "status": "ng",
      "comment": "少し明るくしてください",
      "drawingDataUrl": "data:image/png;base64,...",
      "captionEdit": null,
      "replaceWithPhotoId": null
    }
  }
}
```

**処理フロー：**
```
① confirmToken を検証（存在・有効期限チェック）
② 手書き画像（drawingDataUrl）がある写真：
   └── base64 → PNG に変換して Storage へ保存
       パス: /projects/{projectId}/drawings/{photoId}_r{round}.png
③ Firestore バッチ書き込み（アトミックに実行）：
   a. feedbackRounds/{roundId} を新規作成
   b. 各 photos の currentStatus・latestRound を更新
   c. projects の currentRound・approvedCount・lastFeedbackAt を更新
   d. 全 main photo が ok か判定 → isAllApproved フラグ
④ isAllApproved が false の場合：
   └── projects.status = 'feedback_received'
⑤ isAllApproved が true の場合：
   └── projects.status = 'all_approved'
   └── projects.allApprovedAt = now
   （LINE通知・予約投稿スケジュールは Firestore トリガーが処理）
⑥ 200 レスポンス: { success: true, isAllApproved }
```

---

### 2.3 `scheduleInstagramPosts` — Firestore トリガー

`projects/{projectId}` の `status` が `all_approved` に変更されたときに自動実行。

**トリガー：** `onDocumentUpdated("projects/{projectId}")`

**処理フロー：**
```
① status が 'all_approved' に変わったイベントかを確認
② projects/{projectId}/photos から isActiveForPost: true の写真を取得
③ 各写真の scheduledAt を確認
④ Cloud Tasks（または Cloud Scheduler）に投稿ジョブを登録：
   - タスク名: post_{projectId}_{photoId}
   - 実行時刻: photo.scheduledAt
   - ペイロード: { projectId, photoId }
⑤ 登録完了後、LINE通知を送信：
   「〇〇様の全写真が承認されました。予約投稿をスタートします。」
```

---

### 2.4 `postToInstagram` — Cloud Tasks

指定日時になったら Instagram Graph API で投稿を実行する。

**トリガー：** Cloud Tasks からのHTTPSコール

**処理フロー：**
```
① ペイロード: { projectId, photoId } を受け取る
② Firestore から Photo・Project・Client を取得
③ Client.accessToken の有効期限を確認
   └── 期限切れ → Instagram投稿失敗として処理、LINE通知してスキップ
④ Instagram Graph API でメディアオブジェクト作成：
   POST /v18.0/{instagramBusinessAccountId}/media
   { image_url, caption, published: false }
   → container_id を取得
⑤ メディアコンテナ公開：
   POST /v18.0/{instagramBusinessAccountId}/media_publish
   { creation_id: container_id }
   → instagram_media_id を取得
⑥ 成功時：
   └── photos の instagramStatus = 'posted'
   └── photos の instagramMediaId・instagramPostedAt を更新
   └── LINE通知：「〇〇様 〇月〇日分の投稿が完了しました。」
⑦ 失敗時：
   └── photos の instagramStatus = 'failed'
   └── photos の instagramError にエラー内容を保存
   └── projects.status = 'error'
   └── LINE通知：「⚠️ 投稿エラー：〇〇様 〇枚目 — 手動投稿をご確認ください。」
⑧ 全写真の投稿完了 → projects.status = 'completed'
```

---

### 2.5 `refreshAccessTokens` — Cloud Scheduler（毎日実行）

Instagram のアクセストークンが期限切れになる前に自動更新する。

**スケジュール：** 毎日 AM 9:00（JST）

**処理フロー：**
```
① clients コレクション全件を取得
② 各クライアントの tokenExpiresAt を確認
③ 有効期限まで 5日以内 → トークン更新処理
   ├── GET /oauth/access_token?grant_type=ig_refresh_token&access_token={token}
   └── 成功時：
       ├── client.accessToken を新トークンで更新
       ├── client.tokenExpiresAt を +60日で更新
       ├── client.tokenRefreshedAt = now
       ├── client.tokenStatus = 'valid'
       └── LINE通知：「〇〇様のInstagramトークンを自動更新しました。」
④ 更新失敗 or 既に期限切れ：
   ├── client.tokenStatus = 'expired'
   └── LINE通知：「⚠️ 〇〇様のInstagram連携が切れています。管理画面から再認証をお願いします。」
```

---

### 2.6 `notifyLineOnFeedback` — Firestore トリガー

フィードバック受信時（NG あり）に LINE へ通知する。

**トリガー：** `onDocumentUpdated("projects/{projectId}")`  
（status が `feedback_received` に変わったとき）

**処理フロー：**
```
① status が 'feedback_received' に変わったイベントかを確認
② projects / feedbackRounds / photos を取得
③ 最新の feedbackRound から NG 枚数を取得
④ LINE Notify API で通知送信：
   「〇〇様からフィードバックが届きました。
    NG：{rejectedCount}枚 / 全{totalMainPhotos}枚
    管理画面をご確認ください。」
```

---

## 3. LINE Notify 送信処理

LINE Notify API のエンドポイント：  
`POST https://notify-api.line.me/api/notify`

**共通処理（全関数で使用するヘルパー関数）：**

```typescript
async function sendLineNotify(message: string): Promise<void> {
  const tokenDoc = await db.doc('systemConfig/lineNotify').get();
  const accessToken = tokenDoc.data()?.accessToken;

  await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ message }),
  });
}
```

---

## 4. Cloud Tasks の設定

予約投稿には **Cloud Tasks** を使用する（Cloud Schedulerは定期実行向きのため）。

```
キュー名: instagram-post-queue
最大同時実行: 5
最大再試行回数: 3
再試行間隔: 5分
タスクのTTL: 7日
```

---

## 5. 環境変数（Functions の設定）

Cloud Functions に設定する環境変数（Firebase Functions Config または Secret Manager）：

| 変数名 | 内容 |
|--------|------|
| `LINE_NOTIFY_TOKEN` | LINE Notify アクセストークン |
| `INSTAGRAM_APP_ID` | Meta App ID |
| `INSTAGRAM_APP_SECRET` | Meta App Secret |
| `CONFIRM_URL_BASE` | 確認URL のベースURL（例：`https://your-app.web.app/confirm`） |

---

## 6. 実装順序（推奨）

```
Phase A（最優先・コアフロー）
  1. getProjectByToken ── 確認ページ表示に必須
  2. submitFeedback    ── フィードバック送信に必須

Phase B（自動化）
  3. scheduleInstagramPosts ── 全承認トリガー
  4. postToInstagram         ── Instagram投稿
  5. notifyLineOnFeedback    ── LINE通知

Phase C（メンテナンス）
  6. refreshAccessTokens ── トークン自動更新
```

---

*作成日：2026-05-16*
