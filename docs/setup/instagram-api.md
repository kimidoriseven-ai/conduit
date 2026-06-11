# Instagram API 設定

## 概要

クライアントのInstagram Businessアカウントへ代理投稿するため、各クライアントのアクセストークンが必要。

## 必要なスコープ

| スコープ | 用途 |
|---------|------|
| `instagram_basic` | アカウント情報の読み取り |
| `instagram_content_publish` | 投稿の作成・公開 |

> ⚠️ `manage_pages` と `pages_show_list` は**非推奨・廃止済み**。使用しないこと。

## トークン取得手順（クライアントごとに初回のみ）

### 1. Graph API Explorer でトークン取得

1. [Meta for Developers](https://developers.facebook.com/tools/explorer/) を開く
2. アプリを選択（Meta Developer登録済みのアプリ）
3. 「Generate Access Token」でクライアントのアカウントとして認証
4. スコープ: `instagram_basic`, `instagram_content_publish` のみ選択
5. 生成されたトークンをコピー

### 2. Long-lived Token に変換

Short-lived token（1時間）を Long-lived token（60日）に変換する：

```
GET https://graph.instagram.com/access_token?
    grant_type=ig_exchange_token&
    client_id={app-id}&
    client_secret={app-secret}&
    access_token={short-lived-token}
```

### 3. Instagram Business Account ID 取得

```
GET https://graph.instagram.com/me?fields=id,username&access_token={token}
```

レスポンスの `id` フィールドが Instagram Business Account ID。

### 4. 管理画面に保存

プロジェクト詳細ページ → Instagram設定セクション に以下を入力して保存：
- Instagram Business Account ID
- アクセストークン（Long-lived）

保存時に60日後の有効期限が自動設定される。

## トークン自動更新

- Cloud Function `refreshAccessTokens` が毎日実行
- 有効期限まで5日以内になると自動的に更新
- 更新成功・失敗時にLINE通知が届く

## 注意事項

- トークンは**クライアントごとに異なる**
- 60日間使用されないと失効（自動更新が機能しなくなる）
- Metaのアプリ審査が必要な場合あり（`instagram_content_publish` は審査対象）
