# Firebase 初期設定

## 前提条件

- Google アカウント
- Node.js 22 以上
- Firebase CLI (`npm install -g firebase-tools`)

## Firebase プロジェクト情報

| 項目 | 値 |
|------|-----|
| プロジェクトID | `instagram-post-confirm` |
| リージョン | `asia-northeast1`（東京） |
| Hosting URL | https://instagram-post-confirm.web.app |
| カスタムドメイン | https://conduit-app.com |

## セットアップ手順

### 1. Firebase CLIログイン

```bash
firebase login
```

### 2. プロジェクト初期化（初回のみ）

```bash
cd app
firebase use instagram-post-confirm
```

### 3. フロントエンドのビルドとデプロイ

```bash
cd app
npm install
npm run build
firebase deploy --only hosting
```

### 4. Cloud Functionsのデプロイ

```bash
cd app/functions
npm install
firebase deploy --only functions
```

### 5. Firestoreルールのデプロイ

```bash
firebase deploy --only firestore:rules
```

## Firebase Auth 設定

- メール/パスワード認証を有効化
- 管理者アカウント: Firebase Console > Authentication を参照（コードにはUIDのみ記載）
- **マルチスタッフ機能は不要**（1名のみ）

## 環境変数・設定ファイル

`app/src/firebase/config.js` に Firebase SDK の設定が記載されている。
Firebaseコンソール → プロジェクト設定 → アプリ → SDK構成 から確認可能。

## Cloud Scheduler 設定

Firebase Functions が自動的に以下のスケジューラを作成：

| ジョブ | スケジュール | 説明 |
|--------|------------|------|
| `checkAndPost` | 毎5分 | 予約投稿チェック |
| `refreshAccessTokens` | 毎日 | Instagramトークン自動更新 |
