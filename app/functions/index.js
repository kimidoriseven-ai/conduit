/**
 * Cloud Functions for Instagram Confirm App
 * Node 20 / firebase-functions v6 (gen2)
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule }        = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }      = require('firebase-functions/params');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { randomUUID }        = require('node:crypto');

initializeApp();
const db = getFirestore();

const REGION = 'asia-northeast1'; // 東京リージョン
// 管理者のFirebase Auth UID（不透明IDのため公開リポジトリに含めても個人情報露出にならない）
const ADMIN_UID = 'UMQBgF0qSogFaabzjHUuslmyuQ53';

// Instagram API with Instagram Login（OAuth）設定
const INSTAGRAM_APP_SECRET   = defineSecret('INSTAGRAM_APP_SECRET');
const INSTAGRAM_APP_ID       = process.env.INSTAGRAM_APP_ID; // functions/.env から
const INSTAGRAM_REDIRECT_URI = 'https://conduit-app.com/instagram/callback';

// ============================================================
// ヘルパー: LINE Messaging API でブロードキャスト送信
// Firestore の systemConfig/lineNotify.accessToken を使用
// ============================================================
async function sendLineNotify(message) {
  try {
    const tokenDoc = await db.doc('systemConfig/lineNotify').get();
    const token    = tokenDoc.data()?.accessToken;
    if (!token) {
      console.warn('LINE: accessToken 未設定 (systemConfig/lineNotify.accessToken)');
      return;
    }
    const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ type: 'text', text: message }],
      }),
    });
    if (!res.ok) console.error('LINE Messaging API error:', res.status, await res.text());
  } catch (e) {
    console.error('sendLineNotify 失敗:', e);
  }
}

// ============================================================
// ヘルパー: 投稿先Instagram認証情報の解決（複数アカウント対応）
//   1. project.instagramAccountId があれば instagramAccounts/{id} を使用
//   2. なければ instagramAccounts を見て 1件なら採用 / 複数ならエラー
//   3. 0件なら従来の systemConfig/instagram（後方互換）
//   返り値: { igToken, igAccountId }
// ============================================================
async function resolveInstagramCredentials(project) {
  // 1. 案件に投稿先が明示されている場合
  if (project.instagramAccountId) {
    const acctDoc = await db.doc(`instagramAccounts/${project.instagramAccountId}`).get();
    const acct    = acctDoc.data();
    if (!acct?.accessToken || !acct?.igUserId) {
      throw new Error('案件に設定されたInstagram連携が見つかりません。');
    }
    return { igToken: acct.accessToken, igAccountId: acct.igUserId };
  }

  // 2. 連携済みアカウント数で判断
  const acctsSnap = await db.collection('instagramAccounts').limit(2).get();
  if (acctsSnap.size === 1) {
    const acct = acctsSnap.docs[0].data();
    if (!acct?.accessToken || !acct?.igUserId) {
      throw new Error('Instagram連携情報が不完全です。再連携してください。');
    }
    return { igToken: acct.accessToken, igAccountId: acct.igUserId };
  }
  if (acctsSnap.size >= 2) {
    throw new Error(
      '投稿先のInstagramアカウントが複数あります。案件に投稿先を設定してください。'
    );
  }

  // 3. 後方互換: systemConfig/instagram
  const igConfigDoc = await db.doc('systemConfig/instagram').get();
  const igToken     = igConfigDoc.data()?.accessToken;
  const igAccountId = igConfigDoc.data()?.accountId;
  if (!igToken || !igAccountId) {
    throw new Error(
      'Instagram認証情報が未設定です。管理画面の「システム設定」から入力してください。'
    );
  }
  return { igToken, igAccountId };
}

// ============================================================
// ヘルパー: Instagram 投稿実行
// project に instagramAccountId・instagramAccessToken が必要
// ============================================================
async function executeInstagramPost(projectId) {
  const projectDoc = await db.doc(`projects/${projectId}`).get();
  const project    = projectDoc.data();
  if (!project) throw new Error('プロジェクトが見つかりません');

  const { igToken, igAccountId } = await resolveInstagramCredentials(project);

  // 投稿写真一覧取得（order順）
  const photosSnap = await db
    .collection(`projects/${projectId}/photos`)
    .where('type', '==', 'main')
    .get();
  const photos = photosSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (photos.length === 0) throw new Error('投稿写真がありません');

  const caption = [project.caption, project.hashtags].filter(Boolean).join('\n\n');
  // 投稿先は `me` を使う：トークン自体がアカウントを特定するため、
  // user_id / id（アプリスコープID）の種類違いによる失敗が起きない
  const BASE = `https://graph.instagram.com/v21.0/me`;
  console.log(`Instagram投稿実行: project=${projectId} account=${igAccountId} photos=${photos.length}`);
  // Graph APIの公式仕様に合わせ、パラメータはフォーム形式で送る（JSONボディは非保証）
  const postForm = (url, params) =>
    fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ ...params, access_token: igToken }),
    }).then(r => r.json());

  // メディアの準備完了を待つ（最大50秒、5秒間隔）
  async function waitForMedia(containerId) {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${igToken}`
      ).then(r => r.json());
      if (res.status_code === 'FINISHED') return;
      if (res.status_code === 'ERROR') throw new Error(`メディア処理エラー: ${JSON.stringify(res)}`);
    }
    throw new Error('メディアの準備がタイムアウトしました（50秒）');
  }

  let instagramMediaId;

  if (photos.length === 1) {
    // ── 単枚投稿 ──
    const created   = await postForm(`${BASE}/media`, { image_url: photos[0].storageUrl, caption });
    if (created.error) throw new Error(`メディア作成エラー: ${JSON.stringify(created.error)}`);

    await waitForMedia(created.id);
    const published = await postForm(`${BASE}/media_publish`, { creation_id: created.id });
    if (published.error) throw new Error(`公開エラー: ${JSON.stringify(published.error)}`);
    instagramMediaId = published.id;

  } else {
    // ── カルーセル投稿 ──
    // Step1: 各写真のコンテナを作成
    const containerIds = [];
    for (const photo of photos) {
      const item = await postForm(`${BASE}/media`, {
        image_url:         photo.storageUrl,
        is_carousel_item:  'true',
      });
      if (item.error) throw new Error(`カルーセルアイテムエラー: ${JSON.stringify(item.error)}`);
      containerIds.push(item.id);
    }

    // Step2: カルーセルコンテナを作成
    const carousel = await postForm(`${BASE}/media`, {
      media_type: 'CAROUSEL',
      caption,
      children:   containerIds.join(','),
    });
    if (carousel.error) throw new Error(`カルーセル作成エラー: ${JSON.stringify(carousel.error)}`);

    // Step3: 公開
    await waitForMedia(carousel.id);
    const published = await postForm(`${BASE}/media_publish`, { creation_id: carousel.id });
    if (published.error) throw new Error(`カルーセル公開エラー: ${JSON.stringify(published.error)}`);
    instagramMediaId = published.id;
  }

  return { instagramMediaId, clientName: project.clientName || '' };
}

// ============================================================
// 1. フィードバック受信 → LINE通知
//    projects/{id} の status が 'feedback_received' に変わったとき
// ============================================================
exports.notifyLineOnFeedback = onDocumentUpdated(
  { document: 'projects/{projectId}', region: REGION },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (before.status === after.status) return;
    if (after.status !== 'feedback_received') return;

    const projectId   = event.params.projectId;
    const projectName = after.projectTitle || after.clientName || '案件';

    // 最新の feedbackRound から確認者名と OK/NG 枚数を取得
    const roundsSnap = await db
      .collection(`projects/${projectId}/feedbackRounds`)
      .orderBy('submittedAt', 'desc')
      .limit(1)
      .get();

    let reviewerName = '';
    let ok = 0;
    let ng = 0;
    if (!roundsSnap.empty) {
      const r  = roundsSnap.docs[0].data();
      reviewerName = r.reviewerName || '';
      ok           = r.approvedCount ?? 0;
      ng           = r.rejectedCount ?? 0;
    }

    await sendLineNotify(
      `\n📬 フィードバックが届きました\n\n` +
      `📋 ${projectName}\n` +
      (reviewerName ? `👤 確認者：${reviewerName}\n` : '') +
      `OK：${ok}枚　NG：${ng}枚 / 全${ok + ng}枚\n\n` +
      `管理画面をご確認ください。`
    );
  }
);

// ============================================================
// 2. 全承認 → LINE通知
//    projects/{id} の status が 'all_approved' に変わったとき
// ============================================================
exports.onAllApproved = onDocumentUpdated(
  { document: 'projects/{projectId}', region: REGION },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();
    if (before.status === after.status) return;
    if (after.status !== 'all_approved') return;

    const name = after.projectTitle || after.clientName || '案件';
    const scheduledAt = after.defaultScheduledAt?.toDate
      ? after.defaultScheduledAt.toDate().toLocaleString('ja-JP', {
          year:     'numeric',
          month:    'long',
          day:      'numeric',
          hour:     '2-digit',
          minute:   '2-digit',
          timeZone: 'Asia/Tokyo',
        })
      : '未設定';

    await sendLineNotify(
      `\n✅ 全写真が承認されました\n\n` +
      `👤 ${name}さん\n` +
      `📅 投稿予定：${scheduledAt}\n\n` +
      `予定時刻になったら自動投稿します。`
    );
  }
);

// ============================================================
// 3. 予約投稿チェック（5分ごと）
//    status = 'all_approved' かつ defaultScheduledAt <= now の案件を投稿
// ============================================================
exports.checkScheduledPosts = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Asia/Tokyo', region: REGION },
  async () => {
    const now = Timestamp.now();

    // Firestoreインデックスが必要:
    // コレクション: projects, フィールド: status (ASC), defaultScheduledAt (ASC)
    const snap = await db.collection('projects')
      .where('status', '==', 'all_approved')
      .where('defaultScheduledAt', '<=', now)
      .get();

    if (snap.empty) return;
    console.log(`投稿対象: ${snap.size}件`);

    for (const projectDoc of snap.docs) {
      const projectId = projectDoc.id;

      // 重複投稿防止: 先に status を 'posting' に変更
      try {
        await projectDoc.ref.update({
          status:    'posting',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // 他インスタンスが先に更新した場合はスキップ
        console.log(`skip ${projectId}: ${e.message}`);
        continue;
      }

      // Instagram投稿を実行
      try {
        const { instagramMediaId, clientName } = await executeInstagramPost(projectId);

        await projectDoc.ref.update({
          status:              'completed',
          instagramMediaId,
          instagramPostedAt:   FieldValue.serverTimestamp(),
          updatedAt:           FieldValue.serverTimestamp(),
        });

        await sendLineNotify(
          `\n✨ Instagram投稿が完了しました\n\n` +
          `👤 ${clientName || 'クライアント'}さんの投稿が完了しました。`
        );
        console.log(`投稿完了: ${projectId} mediaId=${instagramMediaId}`);

      } catch (e) {
        console.error(`投稿失敗: ${projectId}`, e.message);

        await projectDoc.ref.update({
          status:         'error',
          instagramError: e.message,
          updatedAt:      FieldValue.serverTimestamp(),
        });

        const latest    = (await projectDoc.ref.get()).data();
        const name      = latest?.clientName || '';
        await sendLineNotify(
          `\n⚠️ Instagram投稿エラー\n\n` +
          `👤 ${name}さんの投稿に失敗しました。\n` +
          `エラー：${e.message?.substring(0, 120)}\n\n` +
          `管理画面をご確認ください。`
        );
      }
    }
  }
);

// ============================================================
// 5. テスト投稿（管理者が手動で即時実行）
// ============================================================
exports.testInstagramPost = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    // auth != null だけでは任意のGoogleアカウントから実投稿を実行できてしまう
    if (request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }
    const projectId = request.data?.projectId;
    if (!projectId) {
      throw new HttpsError('invalid-argument', 'projectId が必要です');
    }
    try {
      const { instagramMediaId } = await executeInstagramPost(projectId);
      return { instagramMediaId };
    } catch (e) {
      // 素のErrorのままだと呼び出し側に「INTERNAL」としか表示されないため、
      // Metaのエラー内容を管理者に見える形で返す
      console.error(`テスト投稿失敗 (${projectId}):`, e.message);
      throw new HttpsError('failed-precondition', e.message || 'Instagram投稿に失敗しました');
    }
  }
);

// ============================================================
// 6. Instagram連携用リンク発行（管理者のみ）
//    ワンタイムstateを発行し、OAuth認可URLを返す
// ============================================================
exports.createInstagramConnectLink = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    if (request.auth.uid !== ADMIN_UID) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }
    if (!INSTAGRAM_APP_ID || INSTAGRAM_APP_ID === 'REPLACE_WITH_INSTAGRAM_APP_ID') {
      throw new HttpsError(
        'failed-precondition',
        'INSTAGRAM_APP_IDが未設定です（functions/.env）'
      );
    }

    // ワンタイムstate（有効期限30分）
    const state    = randomUUID();
    const now      = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    await db.doc(`oauthStates/${state}`).set({
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      used:      false,
    });

    // forceReauth: ログイン画面を必ず表示する（管理者が自分の端末から
    // 別のアカウントを選んで連携したいときに使う）
    const forceReauth = request.data?.forceReauth === true;

    const url =
      `https://www.instagram.com/oauth/authorize` +
      `?client_id=${INSTAGRAM_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=instagram_business_basic,instagram_business_content_publish` +
      `&state=${state}` +
      (forceReauth ? '&force_reauth=true' : '');

    return { url, expiresAt: expiresAt.toISOString() };
  }
);

// ============================================================
// 7. Instagram OAuth 完了処理（認証不要・ワンタイムstateで担保）
//    code/state を受け取りトークン交換 → instagramAccounts/{igUserId} に保存
// ============================================================
exports.completeInstagramOAuth = onCall(
  { region: REGION, secrets: [INSTAGRAM_APP_SECRET] },
  async (request) => {
    const code  = request.data?.code;
    const state = request.data?.state;
    if (typeof code !== 'string' || code.length === 0 ||
        typeof state !== 'string' || state.length === 0) {
      throw new HttpsError('invalid-argument', 'code と state が必要です');
    }

    // ── ワンタイムstateの検証＆消費（レース防止のためトランザクション内で）──
    const stateRef = db.doc(`oauthStates/${state}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      const data = snap.data();
      const expiresAt = data?.expiresAt?.toDate?.();
      if (!snap.exists || data?.used || !expiresAt || expiresAt < new Date()) {
        throw new HttpsError(
          'failed-precondition',
          'リンクが無効か期限切れです。担当者に再発行を依頼してください'
        );
      }
      tx.update(stateRef, { used: true, usedAt: FieldValue.serverTimestamp() });
    });

    const appSecret = INSTAGRAM_APP_SECRET.value();

    // ── 1. 短期アクセストークンの取得 ──
    let shortLived;
    try {
      const body = new URLSearchParams({
        client_id:     INSTAGRAM_APP_ID,
        client_secret: appSecret,
        grant_type:    'authorization_code',
        redirect_uri:  INSTAGRAM_REDIRECT_URI,
        code,
      });
      const res = await fetch('https://api.instagram.com/oauth/access_token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      shortLived = await res.json();
    } catch (e) {
      console.error('短期トークン取得 通信エラー:', e.message);
      throw new HttpsError('internal', 'Instagramとの通信に失敗しました');
    }
    if (!shortLived?.access_token) {
      console.error('短期トークン取得 失敗レスポンス:', JSON.stringify(shortLived));
      const detail = shortLived?.error_message ? `（${shortLived.error_message}）` : '';
      throw new HttpsError(
        'failed-precondition',
        `Instagram連携に失敗しました${detail}`
      );
    }

    // ── 2. 長期アクセストークンへの交換 ──
    let longLived;
    try {
      const url =
        `https://graph.instagram.com/access_token` +
        `?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(shortLived.access_token)}`;
      const res = await fetch(url);
      longLived = await res.json();
    } catch (e) {
      console.error('長期トークン交換 通信エラー:', e.message);
      throw new HttpsError('internal', 'Instagramとの通信に失敗しました');
    }
    if (!longLived?.access_token) {
      console.error('長期トークン交換 失敗レスポンス:', JSON.stringify(longLived));
      throw new HttpsError('failed-precondition', 'Instagram連携に失敗しました（トークン交換）');
    }

    // ── 3. プロフィール取得 ──
    let profile;
    try {
      const url =
        `https://graph.instagram.com/v21.0/me` +
        `?fields=user_id,username` +
        `&access_token=${encodeURIComponent(longLived.access_token)}`;
      const res = await fetch(url);
      profile = await res.json();
    } catch (e) {
      console.error('プロフィール取得 通信エラー:', e.message);
      throw new HttpsError('internal', 'Instagramとの通信に失敗しました');
    }
    if (!profile?.user_id) {
      console.error('プロフィール取得 失敗レスポンス:', JSON.stringify(profile));
      throw new HttpsError('failed-precondition', 'Instagram連携に失敗しました（プロフィール取得）');
    }

    // ── アカウント保存（merge）──
    const igUserId  = String(profile.user_id);
    const expiresIn = longLived.expires_in ?? 5_184_000;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    await db.doc(`instagramAccounts/${igUserId}`).set(
      {
        igUserId,
        username:         profile.username,
        accessToken:      longLived.access_token,
        tokenExpiresAt:   Timestamp.fromDate(tokenExpiresAt),
        connectedAt:      FieldValue.serverTimestamp(),
        tokenRefreshedAt: null,
        updatedAt:        FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { username: profile.username, igUserId };
  }
);

// ============================================================
// ヘルパー: 1ドキュメントのトークンをリフレッシュ
//   期限が5日以内のときのみ graph.instagram.com/refresh_access_token を実行し
//   accessToken / tokenExpiresAt / tokenRefreshedAt を更新する。
//   label は失敗通知用のアカウント名（username または 'レガシー設定'）。
// ============================================================
async function refreshTokenForDoc(docRef, data, label) {
  const now           = new Date();
  const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 3600 * 1000);

  if (!data?.accessToken) return; // トークン未設定はスキップ

  const expiresAt = data.tokenExpiresAt?.toDate?.();
  if (!expiresAt || expiresAt > fiveDaysLater) {
    console.log(`トークン期限に余裕あり、更新不要 (${label})`);
    return;
  }

  console.log(`Instagramトークンを自動更新します (${label})`);
  try {
    const res  = await fetch(
      `https://graph.instagram.com/refresh_access_token` +
      `?grant_type=ig_refresh_token&access_token=${data.accessToken}`
    );
    const result = await res.json();

    if (!result.access_token) throw new Error(JSON.stringify(result));

    const newExpiry = new Date(now.getTime() + (result.expires_in ?? 5_184_000) * 1000);
    await docRef.update({
      accessToken:      result.access_token,
      tokenExpiresAt:   Timestamp.fromDate(newExpiry),
      tokenRefreshedAt: FieldValue.serverTimestamp(),
    });
    console.log(`Instagramトークン更新完了 (${label})`);

  } catch (e) {
    console.error(`Instagramトークン更新失敗 (${label}):`, e.message);
    await sendLineNotify(
      `\n⚠️ Instagramトークン更新失敗\n\n` +
      `アカウント：${label}\n` +
      `トークンを更新できませんでした。\n` +
      `管理画面の「システム設定」から再設定をお願いします。`
    );
  }
}

// ============================================================
// 4. アクセストークン自動更新（毎日 9:00 JST）
//    旧 systemConfig/instagram と instagramAccounts 全件のうち
//    トークン期限が5日以内のものを自動リフレッシュする。
//    1アカウントの失敗で他が止まらないよう try/catch を分ける。
// ============================================================
exports.refreshAccessTokens = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Tokyo', region: REGION },
  async () => {
    // (a) 後方互換: systemConfig/instagram
    try {
      const igDoc  = await db.doc('systemConfig/instagram').get();
      const igData = igDoc.data();
      if (igData?.accessToken) {
        await refreshTokenForDoc(igDoc.ref, igData, 'レガシー設定');
      } else {
        console.log('レガシー設定 未登録のためスキップ');
      }
    } catch (e) {
      console.error('レガシー設定のトークン更新処理でエラー:', e.message);
    }

    // (b) instagramAccounts 全ドキュメント
    const acctsSnap = await db.collection('instagramAccounts').get();
    for (const acctDoc of acctsSnap.docs) {
      const data  = acctDoc.data();
      const label = data?.username || acctDoc.id;
      try {
        await refreshTokenForDoc(acctDoc.ref, data, label);
      } catch (e) {
        console.error(`アカウント ${label} のトークン更新処理でエラー:`, e.message);
      }
    }
  }
);
