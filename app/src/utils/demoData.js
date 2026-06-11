// デモモード（/confirm/demo）用のモックデータ
// ポートフォリオ閲覧者向けのライブデモ＆マニュアル用スクリーンショット撮影に使う。
// 実データ（Firestore）には一切アクセスせず、送信しても何も保存されない。
export const DEMO_TOKEN = 'demo';

const svgPhoto = (label, c1, c2, emoji) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="800" height="1000" fill="url(#g)"/>` +
    `<text x="400" y="490" font-size="180" text-anchor="middle">${emoji}</text>` +
    `<text x="400" y="650" font-size="42" text-anchor="middle" fill="rgba(0,0,0,0.4)" font-family="sans-serif" font-weight="bold">${label}</text>` +
    `</svg>`
  );

const MAIN_DEFS = [
  ['サンプル写真 1', '#FFD3E0', '#FFE8CC', '🌸'],
  ['サンプル写真 2', '#CDE7FF', '#E2F4D3', '☕'],
  ['サンプル写真 3', '#FFF1C9', '#FFD9B3', '🍰'],
  ['サンプル写真 4', '#D9F2E6', '#C9E8F5', '🌿'],
  ['サンプル写真 5', '#EADCF8', '#FBD8E8', '✨'],
];
const ALT_DEFS = [
  ['候補 A', '#E0ECFF', '#D8F6F0', '📷'],
  ['候補 B', '#FFE4EC', '#FFF3D6', '🎀'],
];

export const demoMainPhotos = MAIN_DEFS.map(([label, c1, c2, emoji], i) => {
  const url = svgPhoto(label, c1, c2, emoji);
  return { id: `demo-m${i}`, type: 'main', order: i, storageUrl: url, thumbnailUrl: url };
});

export const demoAltPhotos = ALT_DEFS.map(([label, c1, c2, emoji], i) => {
  const url = svgPhoto(label, c1, c2, emoji);
  return { id: `demo-a${i}`, type: 'alternative', order: i, storageUrl: url, thumbnailUrl: url };
});

const inAWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
};

export const demoProject = {
  id: 'demo',
  projectTitle: 'デモ案件',
  caption: '今日はおすすめのカフェをご紹介します✨\n落ち着いた店内と季節のスイーツが自慢のお店です。ぜひチェックしてみてください！',
  hashtags: '#カフェ巡り #スイーツ好き #おすすめ #日常',
  confirmTokenExpiresAt: { toDate: inAWeek },
  currentRound: 1,
  ngPhotoIds: [],
};

// 「他の確認者の状況共有」機能のデモ用：1名が確認済みの状態
const yesterday = Date.now() - 24 * 60 * 60 * 1000;
export const demoPrevRounds = [
  {
    id: 'demo-r1',
    reviewerName: '佐藤 太郎',
    round: 1,
    submittedAt: { toDate: () => new Date(yesterday), toMillis: () => yesterday },
    approvedCount: 4,
    rejectedCount: 1,
    overallComment: '全体的にいい感じです！よろしくお願いします。',
    photoFeedbacks: {
      'demo-m1': { status: 'ng', comment: 'もう少し明るい写真がいいです', replaceWithPhotoId: null, drawingStorageUrl: null },
    },
  },
];
