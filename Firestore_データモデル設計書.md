# Firestore データモデル設計書
## Instagram投稿確認WEBアプリ

**バージョン：** 1.1  
**作成日：** 2026-05-16  
**最終更新：** 2026-06-13（Instagram OAuth連携に伴う `instagramAccounts` / `oauthStates` コレクション追加、`projects` に `instagramAccountId` 追加）  
**対象技術：** Firebase Firestore / Firebase Storage / Firebase Auth

---

## 1. コレクション構造 全体図

```
Firestore
│
├── clients/{clientId}                        ← クライアント情報・Instagramトークン（旧方式用・残置）
│
├── projects/{projectId}                      ← 案件（投稿1回分）
│   ├── photos/{photoId}                      ← 写真1枚分のデータ
│   └── feedbackRounds/{roundId}              ← フィードバック提出単位（1〜3回）
│
├── instagramAccounts/{igUserId}              ← OAuth連携済みInstagramアカウント（2026-06-13追加）
├── oauthStates/{state}                       ← OAuthワンタイムstate（Admin SDKのみ。2026-06-13追加）
└── systemConfig/lineNotify                   ← LINE Notifyトークンなどシステム設定
```

Firebase Storage
```
/clients/{clientId}/photos/{filename}         ← クライアントのオリジナル写真
/clients/{clientId}/thumbnails/{filename}     ← 表示用圧縮画像（最大1MB）
/projects/{projectId}/drawings/{photoId}_r{round}.png  ← 手書き書き込み画像
```

---

## 2. コレクション詳細設計

### 2.1 `clients` コレクション

クライアント情報とInstagram連携情報を管理する。  
**⚠️ accessToken はサーバーサイド（Cloud Functions）からのみ読み書き可。フロントエンドからアクセス禁止。**

```
/clients/{clientId}
```

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `id` | string | ドキュメントID（自動生成） | `"abc123"` |
| `name` | string | クライアント名 | `"田中様"` |
| `instagramBusinessAccountId` | string | Instagram Business Account ID | `"17841400123"` |
| `instagramPageId` | string | FacebookページID（投稿に使用） | `"123456789"` |
| `accessToken` | string | Long-lived User Access Token（60日有効） | `"EAAG..."` |
| `tokenExpiresAt` | Timestamp | トークン有効期限 | `2026-07-14T00:00:00Z` |
| `tokenRefreshedAt` | Timestamp | 最終リフレッシュ日時 | `2026-05-15T10:00:00Z` |
| `tokenStatus` | string | `"valid"` / `"expiring_soon"` / `"expired"` | `"valid"` |
| `showClientName` | boolean | 確認ページにクライアント名を表示するか | `true` |
| `isLinked` | boolean | Instagram連携済みか | `true` |
| `createdAt` | Timestamp | 作成日時 | |
| `updatedAt` | Timestamp | 最終更新日時 | |

**TypeScript型定義：**
```typescript
interface Client {
  id: string;
  name: string;
  instagramBusinessAccountId: string;
  instagramPageId: string;
  accessToken: string;          // Cloud Functions のみアクセス可
  tokenExpiresAt: Timestamp;
  tokenRefreshedAt: Timestamp;
  tokenStatus: 'valid' | 'expiring_soon' | 'expired';
  showClientName: boolean;
  isLinked: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2.2 `projects` コレクション

1回の投稿依頼 = 1案件。写真枚数・確認URL・ステータスを管理する。

```
/projects/{projectId}
```

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `id` | string | ドキュメントID（自動生成） | |
| `clientId` | string | clients/{clientId} への参照 | `"abc123"` |
| `clientName` | string | 表示用クライアント名（非正規化） | `"田中様"` |
| `status` | string | 案件ステータス（下記参照） | `"waiting_review"` |
| `confirmToken` | string | クライアント確認URL用UUID | `"550e8400-e29b..."` |
| `confirmTokenExpiresAt` | Timestamp | 確認URL有効期限（発行から7日） | |
| `mainPhotoCount` | number | 投稿予定枚数（デフォルト6） | `6` |
| `alternativePhotoCount` | number | 差し替え候補枚数（デフォルト2） | `2` |
| `caption` | string | 共通キャプション（2200文字以内） | `"春の新作..."` |
| `hashtags` | string | 共通ハッシュタグ（スペース区切り、30個以内） | `"#春コーデ #ootd"` |
| `defaultScheduledAt` | Timestamp | デフォルト投稿日時（当日18:00） | |
| `instagramAccountId` | string \| null | 投稿先の `instagramAccounts` igUserId（任意。連携アカウントが2件以上の場合に案件ごと指定） | `"12345678"` |
| `currentRound` | number | 現在のフィードバック回次（1〜） | `1` |
| `approvedCount` | number | 現在のOK枚数（進捗表示用） | `4` |
| `createdAt` | Timestamp | 案件作成日時 | |
| `updatedAt` | Timestamp | 最終更新日時 | |
| `lastFeedbackAt` | Timestamp \| null | 最終フィードバック受信日時 | |
| `allApprovedAt` | Timestamp \| null | 全承認が確定した日時 | |

**案件ステータス一覧：**

| ステータス | 意味 | 画面表示 |
|-----------|------|---------|
| `draft` | 案件作成中（URL未発行） | 下書き |
| `waiting_review` | 確認URL発行済・クライアント確認待ち | 確認待ち |
| `feedback_received` | フィードバック受信（NGあり） | フィードバック受信 |
| `in_revision` | 業者が修正対応中 | 修正対応中 |
| `all_approved` | 全写真承認済み・自動投稿待ち | 投稿予約中 |
| `posting` | Instagram投稿処理中 | 投稿中 |
| `completed` | 全投稿完了 | 投稿完了 |
| `error` | 投稿エラーが発生 | エラー |

**TypeScript型定義：**
```typescript
type ProjectStatus =
  | 'draft'
  | 'waiting_review'
  | 'feedback_received'
  | 'in_revision'
  | 'all_approved'
  | 'posting'
  | 'completed'
  | 'error';

interface Project {
  id: string;
  clientId: string;
  clientName: string;
  status: ProjectStatus;
  confirmToken: string;
  confirmTokenExpiresAt: Timestamp;
  mainPhotoCount: number;       // default: 6, max: 30
  alternativePhotoCount: number; // default: 2, max: 10
  caption: string;
  hashtags: string;
  defaultScheduledAt: Timestamp;
  currentRound: number;
  approvedCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastFeedbackAt: Timestamp | null;
  allApprovedAt: Timestamp | null;
}
```

---

### 2.3 `projects/{projectId}/photos` サブコレクション

写真1枚分のデータ。投稿予定写真・差し替え候補の両方をこのコレクションで管理する。

```
/projects/{projectId}/photos/{photoId}
```

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `id` | string | ドキュメントID（自動生成） | |
| `projectId` | string | 親案件ID | |
| `type` | string | `"main"` (投稿予定) / `"alternative"` (差し替え候補) | `"main"` |
| `order` | number | 表示順（0始まり） | `0` |
| `linkedAlternativeIds` | string[] | この写真に紐づく差し替え候補IDリスト（mainのみ） | `["photoId_7", "photoId_8"]` |
| `linkedMainPhotoId` | string \| null | 紐づく投稿予定写真ID（alternativeのみ） | `"photoId_1"` |
| `storageUrl` | string | Firebase Storage のオリジナル画像URL | |
| `thumbnailUrl` | string | 表示用圧縮画像URL（最大1MB） | |
| `scheduledAt` | Timestamp | 投稿予定日時（案件デフォルトから設定） | |
| `isActiveForPost` | boolean | この写真を実際に投稿するか（差し替え後はfalse） | `true` |
| `replacedByPhotoId` | string \| null | 差し替え指示があった場合の代替写真ID | `null` |
| `currentStatus` | string | 最新のフィードバックステータス | `"pending"` |
| `latestRound` | number | 最新フィードバック回次 | `1` |
| `instagramStatus` | string | Instagram投稿ステータス | `"pending"` |
| `instagramMediaId` | string \| null | 投稿後のInstagram Media ID | `null` |
| `instagramPostUrl` | string \| null | 投稿後のInstagram投稿URL | `null` |
| `instagramPostedAt` | Timestamp \| null | 実際の投稿日時 | `null` |
| `instagramError` | string \| null | 投稿失敗時のエラーメッセージ | `null` |
| `createdAt` | Timestamp | 作成日時 | |
| `updatedAt` | Timestamp | 最終更新日時 | |

**フィードバックステータス（`currentStatus`）：**

| 値 | 意味 |
|----|------|
| `pending` | 未確認（クライアントがまだ判定していない） |
| `ok` | OK（承認済み） |
| `ng` | NG（修正依頼あり） |
| `replace_requested` | 差し替え指示あり |

**Instagram投稿ステータス（`instagramStatus`）：**

| 値 | 意味 |
|----|------|
| `pending` | 未投稿 |
| `scheduled` | 予約投稿登録済み |
| `posted` | 投稿完了 |
| `failed` | 投稿失敗 |
| `skipped` | 差し替えによりスキップ |

**TypeScript型定義：**
```typescript
type PhotoFeedbackStatus = 'pending' | 'ok' | 'ng' | 'replace_requested';
type InstagramPostStatus = 'pending' | 'scheduled' | 'posted' | 'failed' | 'skipped';

interface Photo {
  id: string;
  projectId: string;
  type: 'main' | 'alternative';
  order: number;
  linkedAlternativeIds: string[];   // main のみ使用
  linkedMainPhotoId: string | null;  // alternative のみ使用
  storageUrl: string;
  thumbnailUrl: string;
  scheduledAt: Timestamp;
  isActiveForPost: boolean;
  replacedByPhotoId: string | null;
  currentStatus: PhotoFeedbackStatus;
  latestRound: number;
  instagramStatus: InstagramPostStatus;
  instagramMediaId: string | null;
  instagramPostUrl: string | null;
  instagramPostedAt: Timestamp | null;
  instagramError: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2.4 `projects/{projectId}/feedbackRounds` サブコレクション

クライアントが「送信する」を押した1回分のフィードバックをまとめて保存する。  
フィードバックの履歴が複数回分残るため、業者が過去の修正指示を振り返れる。

```
/projects/{projectId}/feedbackRounds/{roundId}
```

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `id` | string | ドキュメントID | |
| `projectId` | string | 親案件ID | |
| `round` | number | フィードバック回次（1〜） | `1` |
| `submittedAt` | Timestamp | クライアントが送信した日時 | |
| `overallComment` | string | 全体コメント | `"全体的にいい感じです！"` |
| `totalMainPhotos` | number | 投稿予定写真の総枚数 | `6` |
| `approvedCount` | number | OKの枚数 | `4` |
| `rejectedCount` | number | NGの枚数 | `2` |
| `isAllApproved` | boolean | 全写真がOKか | `false` |
| `photoFeedbacks` | Map | 写真ごとのフィードバック（下記） | |

**`photoFeedbacks` の構造（Map型：キー = photoId）：**

```typescript
interface PhotoFeedback {
  photoId: string;
  status: 'ok' | 'ng' | 'replace_requested';
  comment: string;                    // 写真へのコメント
  drawingStorageUrl: string | null;   // 手書き書き込み画像のStorage URL
  captionEdit: string | null;         // クライアントが修正したキャプション
  replaceWithPhotoId: string | null;  // 差し替えを指定した候補写真ID
}
```

**TypeScript型定義：**
```typescript
interface FeedbackRound {
  id: string;
  projectId: string;
  round: number;
  submittedAt: Timestamp;
  overallComment: string;
  totalMainPhotos: number;
  approvedCount: number;
  rejectedCount: number;
  isAllApproved: boolean;
  photoFeedbacks: {
    [photoId: string]: PhotoFeedback;
  };
}
```

---

### 2.5 `systemConfig` コレクション（単一ドキュメント）

システム全体の設定（LINE Notifyトークンなど）を保存する。

```
/systemConfig/lineNotify
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `accessToken` | string | LINE Notify のアクセストークン |
| `updatedAt` | Timestamp | 最終更新日時 |

---

### 2.6 `instagramAccounts` コレクション（2026-06-13追加）

OAuth連携済みInstagramアカウントを管理する。ドキュメントIDは Instagram ユーザーID（`igUserId`）。  
**⚠️ accessToken はサーバーサイド（Cloud Functions）からのみ読み書き可。**

```
/instagramAccounts/{igUserId}
```

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `igUserId` | string | Instagram ユーザーID（ドキュメントIDと同値） | `"12345678"` |
| `username` | string | Instagramユーザー名（@なし） | `"client_shop"` |
| `accessToken` | string | Long-lived アクセストークン（60日有効） | `"IGAAx..."` |
| `tokenExpiresAt` | Timestamp | トークン有効期限 | |
| `connectedAt` | Timestamp | 初回OAuth連携日時 | |
| `tokenRefreshedAt` | Timestamp \| null | 最終自動更新日時 | |
| `updatedAt` | Timestamp | 最終更新日時 | |

**セキュリティルール：** 管理者（Firebase Auth ログイン済み）のみ読み書き可。

**TypeScript型定義：**
```typescript
interface InstagramAccount {
  igUserId: string;
  username: string;
  accessToken: string;         // Cloud Functions のみアクセス可
  tokenExpiresAt: Timestamp;
  connectedAt: Timestamp;
  tokenRefreshedAt: Timestamp | null;
  updatedAt: Timestamp;
}
```

---

### 2.7 `oauthStates` コレクション（2026-06-13追加）

Instagram OAuth フロー用ワンタイムstate。CSRF対策のため Admin SDK（Cloud Functions）のみがアクセスする。  
ドキュメントIDは state 文字列（cryptographically random UUID）。

```
/oauthStates/{state}
```

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `createdAt` | Timestamp | 発行日時 |
| `expiresAt` | Timestamp | 有効期限（発行から30分） |
| `used` | boolean | 使用済みフラグ（トランザクションで `true` に書き換え） |
| `usedAt` | Timestamp \| null | 消費日時 |

**セキュリティルール：** クライアントアクセス全拒否。Admin SDK のみ読み書き可。

---

## 3. Firebase Storage 構造

```
Firebase Storage
│
├── clients/
│   └── {clientId}/
│       ├── photos/
│       │   └── {uuid}_{originalFilename}      ← オリジナル写真（元解像度）
│       └── thumbnails/
│           └── {uuid}_{originalFilename}      ← 表示用圧縮（最大1MB・短辺1080px）
│
└── projects/
    └── {projectId}/
        └── drawings/
            └── {photoId}_r{round}.png         ← 手書き書き込み（PNG透過）
```

**ファイル命名ルール：**
- `uuid`: `crypto.randomUUID()` で生成した一意ID
- `r{round}`: フィードバック回次（例：`r1`, `r2`）
- 書き込み画像は回次ごとに別ファイルとして保存（上書きしない）

---

## 4. セキュリティルール 設計方針

```
/clients/{clientId}
  - read: 業者ログインユーザー（Firebase Auth）のみ
  - write: Cloud Functions のみ（サービスアカウント）
  ⚠️ accessToken フィールドは特に厳重に管理

/projects/{projectId}
  - read/write: 業者ログインユーザーのみ
  ※ 確認ページからのアクセスは Cloud Functions 経由（直接アクセス不可）

/projects/{projectId}/photos/{photoId}
  - read/write: 業者ログインユーザーのみ

/projects/{projectId}/feedbackRounds/{roundId}
  - read: 業者ログインユーザーのみ
  - write: Cloud Functions のみ（フィードバック送信エンドポイント）

/instagramAccounts/{igUserId}
  - read/write: 業者ログインユーザーのみ
  ⚠️ accessToken フィールドは Cloud Functions のみアクセス可

/oauthStates/{state}
  - read/write: 全拒否（Admin SDK = Cloud Functions のみ）

/systemConfig/{docId}
  - read/write: Cloud Functions のみ
```

**クライアント確認ページのアクセス制御：**

クライアントはログイン不要（URLを知っていればアクセス可）だが、  
**Firestore に直接アクセスさせず、必ず Cloud Functions API 経由**にする。

```
クライアントブラウザ
    ↓  confirmToken を含むURLでアクセス
Cloud Functions: getProjectByToken(confirmToken)
    ↓  token 検証・有効期限チェック
    ↓  Firestore から案件・写真データを取得
    ↓  accessToken は含めずにレスポンス
クライアントブラウザ（写真一覧表示）

クライアントブラウザ（送信ボタン押下）
    ↓  フィードバックデータ送信
Cloud Functions: submitFeedback(confirmToken, feedbackData)
    ↓  token 検証・重複送信チェック
    ↓  feedbackRounds に保存・photos の currentStatus を更新
    ↓  isAllApproved なら LINE 通知・予約投稿処理へ
```

---

## 5. Firestore インデックス設計

自動インデックス（単一フィールド）以外に必要な**複合インデックス**：

| コレクション | フィールド1 | フィールド2 | フィールド3 | 用途 |
|------------|-----------|-----------|-----------|------|
| `projects` | `clientId` (ASC) | `createdAt` (DESC) | — | クライアント別案件一覧 |
| `projects` | `status` (ASC) | `createdAt` (DESC) | — | ステータス別案件一覧 |
| `projects/{pid}/photos` | `type` (ASC) | `order` (ASC) | — | 種別・順番でソート |
| `projects/{pid}/feedbackRounds` | `round` (ASC) | `submittedAt` (DESC) | — | フィードバック履歴 |

---

## 6. 確認URL の設計

クライアントに送るURLの形式：

```
https://{your-app}.web.app/confirm/{confirmToken}
```

- `confirmToken`：`crypto.randomUUID()` で生成した UUID v4（推測不可能）
- 有効期限：7日間（`confirmTokenExpiresAt` フィールドで管理）
- 期限切れ後は「このURLは有効期限切れです」画面を表示
- 修正版の再確認時は **同一URLを継続利用**（新URL発行不要）

---

## 7. フィードバック〜全承認のデータフロー

```
① クライアントが「送信する」を押す
    ↓
② Cloud Functions: submitFeedback()
   ├── feedbackRounds/{roundId} を新規作成
   ├── photos の currentStatus・latestRound を一括更新
   ├── projects の currentRound・approvedCount・lastFeedbackAt を更新
   └── isAllApproved の判定
       ├── NG あり → projects.status = 'feedback_received'
       │            LINE通知「〇〇様からフィードバックが届きました。NGあり」
       └── 全OK   → projects.status = 'all_approved'
                    projects.allApprovedAt = now
                    LINE通知「〇〇様の全写真が承認されました」
                    各写真の scheduledAt に基づいてCloud Scheduleを登録
```

---

## 8. 差し替え処理のデータフロー

```
① クライアントがフィードバックで「候補Aに差し替えてください」を指定
    ↓
② submitFeedback() が実行
   └── PhotoFeedback.replaceWithPhotoId = "alternative_photoId"

③ 業者が管理画面で差し替え指示を確認・承認
    ↓
④ Cloud Functions: applyReplacement(projectId, mainPhotoId, alternativePhotoId)
   ├── main photo: isActiveForPost = false, replacedByPhotoId = alternativePhotoId
   ├── alternative photo: isActiveForPost = true
   └── 投稿対象写真が確定

⑤ 全承認かつ差し替え確定後 → 予約投稿スタート
```

---

## 9. 設計上の重要な決定事項

| 決定事項 | 内容 | 理由 |
|---------|------|------|
| サブコレクション採用 | photos・feedbackRounds を案件のサブコレクションに | 案件削除時に一括削除可能、クエリが案件スコープで完結 |
| キャプション共通化 | caption・hashtags は Project レベルで保持 | Instagram投稿は1案件＝1投稿分のキャプションが共通のため |
| フィードバック履歴保持 | feedbackRounds を削除せず蓄積 | 過去のやり取りを業者が振り返れるようにする |
| accessToken の保護 | Firestore に保存するが Cloud Functions からのみアクセス | フロントエンドへの漏洩を防ぐ最重要セキュリティ要件 |
| 確認URL = 固定URL | 修正再確認時も同一 confirmToken を継続使用 | クライアントがLINEの履歴から再アクセスできる利便性 |
| 非正規化（clientName） | Project に clientName を持つ | 一覧表示時に clients を別途クエリしなくて済む |
| 可変枚数対応 | mainPhotoCount / alternativePhotoCount をフィールドで管理 | デフォルト6+2、最大30+10に対応（要件定義通り） |

---

## 10. 次のステップ

このデータモデルに基づいて以下を進める：

1. **Firebase プロジェクト作成**（Firebaseコンソールで手動設定）
2. **セキュリティルール実装**（`firestore.rules`）
3. **React + Vite プロジェクト雛形作成**
4. **Cloud Functions の実装開始**

---

*作成日：2026-05-16 | 次回更新：実装時に判明した仕様変更を反映*
