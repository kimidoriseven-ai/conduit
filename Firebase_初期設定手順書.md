# Firebase 初期設定手順書
## Instagram投稿確認WEBアプリ

**作成日：** 2026-05-16  
**対象者：** 管理者（プロジェクトオーナー）  
**所要時間：** 約30〜45分

---

## はじめに

この手順書に沿ってFirebaseプロジェクトを作成すると、アプリの動作に必要なデータベース・ストレージ・認証・ホスティングがすべて整います。Claudeと一緒に作業を進めていただくと、設定が完了したタイミングでReactプロジェクトの構築に移れます。

---

## ステップ 1：Firebaseプロジェクトの作成

1. ブラウザで [https://console.firebase.google.com](https://console.firebase.google.com) を開く
2. Googleアカウントでログイン（管理者のGoogleアカウントを使用）
3. 「**プロジェクトを作成**」をクリック
4. プロジェクト名を入力：`instagram-post-confirm`（または任意の名前）
5. Googleアナリティクスは「**無効にする**」を選択（不要）
6. 「**プロジェクトを作成**」をクリック → 作成完了まで待つ

---

## ステップ 2：Webアプリの登録

1. プロジェクトのホーム画面で「**ウェブ**」アイコン（`</>`）をクリック
2. アプリのニックネームを入力：`instagram-confirm-web`
3. 「**Firebase Hosting も設定する**」にチェックを入れる
4. 「**アプリを登録**」をクリック
5. 表示される `firebaseConfig` の内容をコピーしておく（後で使用）

```javascript
// こんな形式のコードが表示されます（例）
const firebaseConfig = {
  apiKey: "AIzaS...",
  authDomain: "instagram-post-confirm.firebaseapp.com",
  projectId: "instagram-post-confirm",
  storageBucket: "instagram-post-confirm.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

⚠️ この情報はClaudeに共有してください（Reactプロジェクト設定に使用します）

---

## ステップ 3：Firestore Database の有効化

1. 左メニューの「**Firestore Database**」をクリック
2. 「**データベースを作成**」をクリック
3. ロケーションを選択：**asia-northeast1（東京）**
4. セキュリティルール：「**本番環境モードで開始**」を選択
5. 「**有効にする**」をクリック

---

## ステップ 4：Firebase Storage の有効化

1. 左メニューの「**Storage**」をクリック
2. 「**始める**」をクリック
3. セキュリティルール：「**本番環境モードで開始**」を選択
4. ロケーション：Firestore と同じ **asia-northeast1** を選択
5. 「**完了**」をクリック

---

## ステップ 5：Firebase Authentication の有効化

1. 左メニューの「**Authentication**」をクリック
2. 「**始める**」をクリック
3. 「**Sign-in method**」タブを開く
4. 「**メール/パスワード**」をクリック → 「**有効にする**」にチェック → 「**保存**」
5. 「**ユーザー**」タブを開く → 「**ユーザーを追加**」
   - メールアドレス：管理者のメールアドレス（管理画面ログイン用）
   - パスワード：任意の安全なパスワードを設定
   - 「**ユーザーを追加**」をクリック

---

## ステップ 6：Firebase Hosting の確認

Webアプリ登録時（ステップ2）に Hosting も設定済みのため、この手順は確認のみ。

1. 左メニューの「**Hosting**」をクリック
2. 「instagram-confirm-web」サイトが表示されていれば OK

---

## ステップ 7：Cloud Functions の有効化

1. 左メニューの「**Functions**」をクリック
2. 「**始める**」をクリック
3. 料金プランのアップグレードを求められる場合：
   - 「**Blaze プラン（従量課金）**」へのアップグレードが必要
   - Cloud Functions を使うためのFirebaseの要件です
   - 小規模な利用では無料枠内に収まることがほとんど（月数百円以下）
   - クレジットカードを登録してアップグレード

---

## ステップ 8：設定情報の共有

すべての設定が完了したら、以下の情報をClaude（このチャット）に共有してください。Reactプロジェクトの初期設定を進めます。

**共有してほしい情報：**

```
■ firebaseConfig（ステップ2でコピーしたコード）
■ Firebase プロジェクトID（例：instagram-post-confirm）
■ 管理画面ログイン用メールアドレス（ステップ5で登録したもの）
```

⚠️ パスワードは共有しないでください。

---

## 次にやること（Claude が進める作業）

Firebase設定が完了したら、Claudeが以下を自動で準備します：

1. **React + Vite プロジェクトの雛形作成**（フォルダ構成・依存パッケージ）
2. **Firestore セキュリティルールの実装**（`firestore.rules`）
3. **Cloud Functions の実装開始**（`getProjectByToken` → `submitFeedback` の順）
4. **クライアント確認ページのReact実装**（プロトタイプHTMLをコンポーネント化）

---

*作成日：2026-05-16*
