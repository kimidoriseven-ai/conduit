# データモデル

## Firestore コレクション構造

```
Firestore
│
├── projects/{projectId}                  ← 案件（投稿1回分）
│   ├── photos/{photoId}                  ← 写真1枚のデータ
│   └── feedbackRounds/{roundId}          ← フィードバック提出単位
│
└── systemConfig/lineNotify               ← LINEトークンなどシステム設定
```

## projects コレクション

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `clientName` | string | クライアント名 |
| `confirmToken` | string | 確認URL用トークン（UUID） |
| `status` | string | 案件ステータス（下記参照） |
| `caption` | string | Instagramキャプション |
| `hashtags` | string | ハッシュタグ |
| `mainPhotoCount` | number | メイン写真枚数 |
| `altPhotoCount` | number | サブ写真枚数 |
| `approvedCount` | number | 承認済み枚数 |
| `rejectedCount` | number | NG枚数 |
| `scheduledAt` | timestamp | 投稿予定日時 |
| `instagramAccountId` | string | Instagram Business Account ID |
| `instagramAccessToken` | string | アクセストークン |
| `instagramTokenExpiresAt` | timestamp | トークン有効期限（60日） |
| `currentRound` | number | 現在のフィードバックラウンド |
| `lastFeedbackAt` | timestamp | 最終フィードバック日時 |
| `allApprovedAt` | timestamp | 全承認日時 |
| `postedAt` | timestamp | 投稿完了日時 |
| `createdAt` | timestamp | 案件作成日時 |
| `updatedAt` | timestamp | 最終更新日時 |

### ステータス遷移

```
draft → waiting_review → feedback_received → in_revision → waiting_review
                       ↓（全承認）
                    all_approved → posting → completed
                                           → error
```

| ステータス | 意味 |
|-----------|------|
| `draft` | 下書き |
| `waiting_review` | クライアント確認待ち |
| `feedback_received` | フィードバック受信 |
| `in_revision` | 修正対応中 |
| `all_approved` | 全承認・投稿予約中 |
| `posting` | 投稿中 |
| `completed` | 投稿完了 |
| `error` | エラー |

## photos サブコレクション

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `url` | string | Firebase Storage URL（元画像） |
| `thumbnailUrl` | string | サムネイルURL |
| `type` | string | `"main"` / `"alt"` |
| `order` | number | 表示順 |
| `currentStatus` | string | `"pending"` / `"approved"` / `"rejected"` |
| `latestRound` | number | 最後に評価したラウンド |
| `updatedAt` | timestamp | |

## feedbackRounds サブコレクション

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `round` | number | ラウンド番号（1〜） |
| `overallComment` | string | 全体コメント |
| `captionEdit` | string \| null | キャプション修正案 |
| `hashtagEdit` | string \| null | ハッシュタグ修正案 |
| `photoFeedbacks` | array | 写真ごとのフィードバック |
| `approvedCount` | number | |
| `rejectedCount` | number | |
| `isAllApproved` | boolean | |
| `submittedAt` | timestamp | |

## systemConfig/lineNotify

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `accessToken` | string | LINE Messaging API チャンネルアクセストークン |
| `updatedAt` | timestamp | |

## Firebase Storage 構造

```
/projects/{projectId}/photos/{filename}       ← 元画像
/projects/{projectId}/thumbnails/{filename}   ← サムネイル（圧縮済み）
```

## Firestore セキュリティルール 概要

| コレクション | 読み取り | 書き込み |
|-------------|---------|---------|
| `projects` | 全員OK（確認URLアクセス） | 管理者のみ（更新は限定フィールドのみクライアント可） |
| `projects/photos` | 全員OK | 管理者のみ（ステータス更新のみクライアント可） |
| `projects/feedbackRounds` | 管理者のみ | 管理者 + クライアント（新規作成のみ） |
| `systemConfig` | 読み取り不可 | 管理者のみ |
