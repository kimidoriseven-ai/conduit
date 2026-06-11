# トラブルシューティング

## 投稿が実行されない

**確認手順:**

1. ステータスが「投稿予約中」になっているか確認
2. 投稿予定日時が過去になっているか確認
3. Firebase Console → Functions → `checkAndPost` のログを確認
4. Instagramトークンが有効か確認（有効期限をプロジェクト詳細で確認）

**原因と対処:**

| 原因 | 対処 |
|------|------|
| トークン失効 | Instagram設定で新しいトークンを保存 |
| 予定日時が未来 | 日時を確認・修正 |
| Cloud Functionエラー | Firebaseコンソールのログを確認 |
| 画像URLが無効 | 写真を再アップロード |

---

## LINEに通知が届かない

**確認手順:**

1. LINE Official Accountにフレンド登録しているか確認
2. 管理画面 → システム設定 でトークンが保存されているか確認（保存後に「保存しました」表示が出たか）
3. Firebase Console → Functions → `sendLineNotification` のログを確認

**対処:** システム設定でトークンを再保存してみる。

---

## クライアントが確認URLを開けない

**確認:**
- URLが正確にコピーされているか（スペース・改行が入っていないか）
- URLが `https://conduit-app.com/confirm/...` の形式か
- ステータスが「確認待ち」または「修正対応中」か

**対処:** プロジェクト詳細ページから確認URLをコピーし直して再送付。

---

## 写真がアップロードできない

**原因と対処:**

| 原因 | 対処 |
|------|------|
| ファイルサイズが大きすぎる | 10MB以下に圧縮 |
| 対応していない形式 | JPG・PNG・HEIC に変換 |
| ネット回線が不安定 | 安定した回線で再試行 |

---

## ログイン（管理者）できない

1. パスワードを確認（メモ帳・パスワードマネージャー参照）
2. 忘れた場合: Firebase Console → Authentication → 管理者アカウント（Firebase Console参照） → パスワードリセット

---

## conduit-app.com にアクセスできない

1. DNS反映を待つ（最大24時間）
2. ブラウザのキャッシュをクリア
3. 別のブラウザ・シークレットモードで試す
4. 緊急時は https://instagram-post-confirm.web.app を使用

---

## Firebase コンソールでのログ確認方法

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. プロジェクト `instagram-post-confirm` を選択
3. 左メニュー → Functions → ログ
4. 関数名でフィルタリング（`checkAndPost` / `refreshAccessTokens` / `sendLineNotification`）
