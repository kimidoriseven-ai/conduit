# カスタムドメイン設定

## ドメイン情報

| 項目 | 値 |
|------|-----|
| ドメイン | conduit-app.com |
| レジストラ | お名前.com |
| ネームサーバー | 01〜04.dnsv.jp（お名前.com管理） |
| Firebase Hosting IP | 199.36.158.100 |

## お名前.com DNS設定（登録済み）

| TYPE | ホスト名 | 値 | TTL |
|------|---------|-----|-----|
| A | conduit-app.com | 199.36.158.100 | 3600 |
| TXT | conduit-app.com | hosting-site=instagram-post-confirm | 3600 |

## Firebase Hosting 設定

Firebase Console → Hosting → カスタムドメイン → conduit-app.com  
SSL証明書はFirebaseが自動発行・自動更新する。

## DNS変更後の確認手順

```bash
# DNS反映確認（コマンドプロンプト）
nslookup conduit-app.com
```

`199.36.158.100` が返れば正常。

## 新規ドメイン追加の場合

1. お名前.com でドメイン取得
2. Firebase Console → Hosting → 「カスタムドメインを追加」
3. 表示されたTXTレコードをお名前.comに追加
4. TXT認証完了後、Aレコードを追加
5. SSL証明書発行を待つ（15分〜数時間）

## 注意事項

- ネームサーバー変更チェックボックスはONのまま（01.dnsv.jpに設定済み）
- DNS反映には最大24時間かかる場合がある
- www.conduit-app.com は設定していない（不要な場合はそのまま）
