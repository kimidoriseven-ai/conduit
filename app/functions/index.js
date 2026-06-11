/**
 * Cloud Functions for Instagram Confirm App
 * Node 20 / firebase-functions v6 (gen2)
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule }        = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const REGION = 'asia-northeast1'; // 東京リージョン
// 管理者のFirebase Auth UID（不透明IDのため公開リポジトリに含めても個人情報露出にならない）
const ADMIN_UID = 'UMQBgF0qSogFaabzjHUuslmyuQ53';

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
// ヘルパー: Instagram 投稿実行
// project に instagramAccountId・instagramAccessToken が必要
// ============================================================
async function executeInstagramPost(projectId) {
  const [projectDoc, igConfigDoc] = await Promise.all([
    db.doc(`projects/${projectId}`).get(),
    db.doc('systemConfig/instagram').get(),
  ]);
  const project = projectDoc.data();
  if (!project) throw new Error('プロジェクトが見つかりません');

  const igToken     = igConfigDoc.data()?.accessToken;
  const igAccountId = igConfigDoc.data()?.accountId;
  if (!igToken || !igAccountId) {
    throw new Error(
      'Instagram認証情報が未設定です。管理画面の「システム設定」から入力してください。'
    );
  }

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
  const BASE    = `https://graph.instagram.com/v21.0/${igAccountId}`;
  const postJSON = (url, body) =>
    fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...body, access_token: igToken }),
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
    const created   = await postJSON(`${BASE}/media`, { image_url: photos[0].storageUrl, caption });
    if (created.error) throw new Error(`メディア作成エラー: ${JSON.stringify(created.error)}`);

    await waitForMedia(created.id);
    const published = await postJSON(`${BASE}/media_publish`, { creation_id: created.id });
    if (published.error) throw new Error(`公開エラー: ${JSON.stringify(published.error)}`);
    instagramMediaId = published.id;

  } else {
    // ── カルーセル投稿 ──
    // Step1: 各写真のコンテナを作成
    const containerIds = [];
    for (const photo of photos) {
      const item = await postJSON(`${BASE}/media`, {
        image_url:         photo.storageUrl,
        is_carousel_item:  true,
      });
      if (item.error) throw new Error(`カルーセルアイテムエラー: ${JSON.stringify(item.error)}`);
      containerIds.push(item.id);
    }

    // Step2: カルーセルコンテナを作成
    const carousel = await postJSON(`${BASE}/media`, {
      media_type: 'CAROUSEL',
      caption,
      children:   containerIds.join(','),
    });
    if (carousel.error) throw new Error(`カルーセル作成エラー: ${JSON.stringify(carousel.error)}`);

    // Step3: 公開
    await waitForMedia(carousel.id);
    const published = await postJSON(`${BASE}/media_publish`, { creation_id: carousel.id });
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
    const { instagramMediaId } = await executeInstagramPost(projectId);
    return { instagramMediaId };
  }
);

// ============================================================
// 4. アクセストークン自動更新（毎日 9:00 JST）
//    systemConfig/instagram のトークン期限が5日以内なら自動リフレッシュ
// ============================================================
exports.refreshAccessTokens = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Tokyo', region: REGION },
  async () => {
    const now          = new Date();
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 3600 * 1000);

    const igDoc = await db.doc('systemConfig/instagram').get();
    const igData = igDoc.data();
    if (!igData?.accessToken) {
      console.log('Instagram設定未登録のためスキップ');
      return;
    }

    const expiresAt = igData.tokenExpiresAt?.toDate?.();
    if (!expiresAt || expiresAt > fiveDaysLater) {
      console.log('トークン期限に余裕あり、更新不要');
      return;
    }

    console.log('Instagramトークンを自動更新します');
    try {
      const res  = await fetch(
        `https://graph.instagram.com/refresh_access_token` +
        `?grant_type=ig_refresh_token&access_token=${igData.accessToken}`
      );
      const data = await res.json();

      if (!data.access_token) throw new Error(JSON.stringify(data));

      const newExpiry = new Date(now.getTime() + (data.expires_in ?? 5_184_000) * 1000);
      await igDoc.ref.update({
        accessToken:      data.access_token,
        tokenExpiresAt:   Timestamp.fromDate(newExpiry),
        tokenRefreshedAt: FieldValue.serverTimestamp(),
      });
      console.log('Instagramトークン更新完了');

    } catch (e) {
      console.error('Instagramトークン更新失敗:', e.message);
      await sendLineNotify(
        `\n⚠️ Instagramトークン更新失敗\n\n` +
        `トークンを更新できませんでした。\n` +
        `管理画面の「システム設定」から再設定をお願いします。`
      );
    }
  }
);
