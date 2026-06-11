import { useState, useEffect } from 'react';
import {
  doc, getDoc, collection, getDocs, query, orderBy, limit,
  updateDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../../firebase/config';
import { toast } from '../../components/Toast';
import usePageTitle from '../../hooks/usePageTitle';
import { uploadPhoto } from '../../utils/image';

const uuidv4 = () => crypto.randomUUID();
const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

function storagePathFromUrl(url) {
  try {
    const encoded = new URL(url).pathname.split('/o/')[1];
    return decodeURIComponent(encoded.split('?')[0]);
  } catch { return null; }
}

const STATUS_LABELS = {
  draft:             { label: '下書き',            badge: 'b-rev' },
  waiting_review:    { label: '確認待ち',           badge: 'b-wait' },
  feedback_received: { label: 'フィードバック受信',  badge: 'b-fb' },
  in_revision:       { label: '修正対応中',          badge: 'b-rev' },
  all_approved:      { label: '投稿予約中',          badge: 'b-done' },
  posting:           { label: '投稿中',              badge: 'b-done' },
  completed:         { label: '投稿完了',            badge: 'b-ok' },
  error:             { label: 'エラー',              badge: 'b-ng' },
};
const BADGE_STYLES = {
  'b-wait': { background: '#FFF3CD', color: '#856404' },
  'b-fb':   { background: '#FFEBEB', color: '#E24B4A' },
  'b-rev':  { background: '#E8F4FD', color: '#0055BB' },
  'b-done': { background: '#E6F9F0', color: '#00A651' },
  'b-ok':   { background: '#E6F9F0', color: '#00A651' },
  'b-ng':   { background: '#FFEBEB', color: '#E24B4A' },
};

export default function ProjectDetailPage() {
  usePageTitle('案件詳細');
  const { id } = useParams();
  const navigate = useNavigate();

  const [project,    setProject]    = useState(null);
  const [mainPhotos, setMainPhotos] = useState([]);
  const [altPhotos,  setAltPhotos]  = useState([]);
  const [latestFb,   setLatestFb]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [copied,     setCopied]     = useState(false);

  // テスト投稿
  const [igTesting,    setIgTesting]    = useState(false);
  const [igTestResult, setIgTestResult] = useState(null); // { ok, mediaId?, error? }

  // 修正対応
  const [revisionPhotos,  setRevisionPhotos]  = useState({}); // { photoId: { file, preview } }
  const [reconfirming,    setReconfirming]    = useState(false);
  const [captionEdit,     setCaptionEdit]     = useState('');
  const [hashtagEdit,     setHashtagEdit]     = useState('');
  const [newAltFiles,     setNewAltFiles]     = useState([]); // [{ id, file, preview }]
  const [altToDelete,     setAltToDelete]     = useState([]); // photo IDs

  // 投稿キャンセル
  const [showCancelForm,   setShowCancelForm]   = useState(false);
  const [cancelScheduledAt, setCancelScheduledAt] = useState('');
  const [canceling,         setCanceling]         = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const pSnap = await getDoc(doc(db, 'projects', id));
        if (!pSnap.exists()) { setLoading(false); return; }
        const p = { id: pSnap.id, ...pSnap.data() };
        setProject(p);
        setCaptionEdit(p.caption  || '');
        setHashtagEdit(p.hashtags || '');

        // 翌日18:00をデフォルトの再設定日時に
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(18, 0, 0, 0);
        const pad = n => String(n).padStart(2, '0');
        setCancelScheduledAt(
          `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}T18:00`
        );

        const photosSnap = await getDocs(collection(db, 'projects', id, 'photos'));
        const all = photosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMainPhotos(all.filter(ph => ph.type === 'main').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        setAltPhotos(all.filter(ph => ph.type === 'alternative').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

        if (['feedback_received', 'in_revision', 'all_approved', 'completed'].includes(p.status)) {
          const fbQ = query(collection(db, 'projects', id, 'feedbackRounds'), orderBy('round', 'desc'), limit(1));
          const fbSnap = await getDocs(fbQ);
          if (!fbSnap.empty) setLatestFb({ id: fbSnap.docs[0].id, ...fbSnap.docs[0].data() });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleTestPost() {
    setIgTesting(true);
    setIgTestResult(null);
    try {
      const fn = httpsCallable(functions, 'testInstagramPost');
      const result = await fn({ projectId: id });
      setIgTestResult({ ok: true, mediaId: result.data.instagramMediaId });
    } catch (e) {
      setIgTestResult({ ok: false, error: e.message || '投稿に失敗しました' });
    } finally {
      setIgTesting(false);
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/confirm/${project.confirmToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function shareLine() {
    const url = `${window.location.origin}/confirm/${project.confirmToken}`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(`投稿写真のご確認をお願いします🙏\n${url}`)}`);
  }

  // 修正写真をセット（プレビューのみ、まだアップロードしない）
  function stageRevisionPhoto(photoId, file) {
    setRevisionPhotos(prev => ({
      ...prev,
      [photoId]: { file, preview: URL.createObjectURL(file) },
    }));
  }

  // 再確認依頼：NG写真・差し替え候補・キャプションを更新して waiting_review に戻す
  async function handleReconfirmRequest() {
    setReconfirming(true);
    try {
      // 1. NG写真の差し替え・ステータスリセット
      const currentNgIds = project.ngPhotoIds || [];
      for (const photoId of currentNgIds) {
        const rev = revisionPhotos[photoId];
        if (rev?.file) {
          const { storageUrl, thumbnailUrl } = await uploadPhoto(id, rev.file);
          await updateDoc(doc(db, 'projects', id, 'photos', photoId), {
            storageUrl, thumbnailUrl, currentStatus: 'pending', updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'projects', id, 'photos', photoId), {
            currentStatus: 'pending', updatedAt: serverTimestamp(),
          });
        }
      }

      // 2. 差し替え候補写真の削除
      for (const altId of altToDelete) {
        const alt = altPhotos.find(a => a.id === altId);
        if (alt) {
          for (const url of [alt.storageUrl, alt.thumbnailUrl].filter(Boolean)) {
            try { const p = storagePathFromUrl(url); if (p) await deleteObject(ref(storage, p)); } catch {}
          }
          await deleteDoc(doc(db, 'projects', id, 'photos', altId));
        }
      }

      // 3. 差し替え候補写真の追加
      const remainingAltCount = altPhotos.filter(a => !altToDelete.includes(a.id)).length;
      for (let i = 0; i < newAltFiles.length; i++) {
        const { file } = newAltFiles[i];
        const { storageUrl, thumbnailUrl } = await uploadPhoto(id, file);
        await addDoc(collection(db, 'projects', id, 'photos'), {
          type: 'alternative', storageUrl, thumbnailUrl,
          order: remainingAltCount + i, currentStatus: 'pending',
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }

      // 4. プロジェクト更新（キャプション・ハッシュタグ変更があれば反映）
      const projectUpdate = {
        status: 'waiting_review',
        currentRound: (project.currentRound || 1) + 1,
        reviewerCount: 0, ngPhotoIds: [], approvedCount: 0, rejectedCount: 0,
        updatedAt: serverTimestamp(),
      };
      if (captionEdit !== (project.caption || ''))   projectUpdate.caption  = captionEdit;
      if (hashtagEdit !== (project.hashtags || ''))  projectUpdate.hashtags = hashtagEdit;
      await updateDoc(doc(db, 'projects', id), projectUpdate);

      navigate('/admin');
    } catch (e) {
      console.error(e);
      toast('再確認依頼に失敗しました。');
      setReconfirming(false);
    }
  }

  // 投稿予約キャンセル → waiting_review に戻す
  async function handleCancelSchedule() {
    setCanceling(true);
    try {
      const updateData = {
        status:    'waiting_review',
        updatedAt: serverTimestamp(),
      };
      if (cancelScheduledAt) {
        updateData.defaultScheduledAt = Timestamp.fromDate(new Date(cancelScheduledAt));
      }
      await updateDoc(doc(db, 'projects', id), updateData);
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast('キャンセルに失敗しました。');
      setCanceling(false);
    }
  }

  const font = { fontFamily: '-apple-system, "Hiragino Sans", sans-serif' };
  const card = { background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '14px 16px', marginBottom: 12 };
  const lbl  = { display: 'block', fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#BBB', ...font }}>読み込み中...</div>;
  if (!project) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#E24B4A', ...font }}>案件が見つかりません</div>;

  const statusInfo  = STATUS_LABELS[project.status] || STATUS_LABELS.draft;
  const badgeStyle  = BADGE_STYLES[statusInfo.badge] || BADGE_STYLES['b-rev'];
  const confirmUrl  = `${window.location.origin}/confirm/${project.confirmToken}`;
  const scheduledAt = project.defaultScheduledAt?.toDate
    ? project.defaultScheduledAt.toDate().toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '未設定';
  const hasFeedback = !!latestFb;
  const fbNgCount   = latestFb ? latestFb.rejectedCount : 0;
  const fbDate      = latestFb?.submittedAt?.toDate
    ? latestFb.submittedAt.toDate().toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  // 修正対応パネル用：NGだった写真（プロジェクトの ngPhotoIds を使用）
  const ngPhotos = mainPhotos.filter(p => (project.ngPhotoIds || []).includes(p.id));

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', background: '#F5F5F5', minHeight: '100vh', ...font }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/admin" style={{ fontSize: 26, color: '#999', textDecoration: 'none', lineHeight: 1, padding: '2px 8px 2px 0' }}>‹</Link>
        <span style={{ fontSize: 15, fontWeight: 600 }}>案件詳細</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '14px 14px 48px' }}>

        {/* ── ステータスカード ── */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 3 }}>
              {project.projectTitle || project.clientName || '（案件名なし）'}
            </p>
            <p style={{ fontSize: 12, color: '#AAA' }}>
              投稿予定：{scheduledAt}　写真：{mainPhotos.length}枚
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 12, flexShrink: 0, ...badgeStyle }}>
            {statusInfo.label}
          </span>
        </div>

        {/* ── フィードバック受信バナー ── */}
        {hasFeedback && project.status === 'feedback_received' && (
          <div style={{ background: '#FFF5F5', borderRadius: 16, border: '0.5px solid #F09595', padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#E24B4A', marginBottom: 3 }}>フィードバックが届きました</p>
              <p style={{ fontSize: 11, color: '#AAA' }}>NG：{fbNgCount}枚　送信：{fbDate}</p>
            </div>
            <Link to={`/admin/projects/${id}/feedback`} style={{ textDecoration: 'none', flexShrink: 0 }}>
              <button style={{ padding: '9px 16px', borderRadius: 20, border: 'none', background: GRAD, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...font }}>
                確認する
              </button>
            </Link>
          </div>
        )}

        {/* ── 全承認バナー（キャンセルボタン付き） ── */}
        {project.status === 'all_approved' && (
          <div style={{ background: '#E6F9F0', borderRadius: 16, border: '0.5px solid #A5D6A7', padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showCancelForm ? 12 : 0 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#00A651', marginBottom: 2 }}>全写真が承認されました</p>
                <p style={{ fontSize: 11, color: '#AAA' }}>投稿予定日時に自動投稿されます</p>
              </div>
              <button
                onClick={() => setShowCancelForm(v => !v)}
                style={{ padding: '7px 12px', borderRadius: 16, border: '1px solid #A5D6A7', background: '#fff', color: '#666', fontSize: 11, cursor: 'pointer', flexShrink: 0, ...font }}>
                予約取消
              </button>
            </div>
            {showCancelForm && (
              <div style={{ borderTop: '0.5px solid #A5D6A7', paddingTop: 12 }}>
                <label style={{ ...lbl, color: '#666' }}>新しい投稿予定日時</label>
                <input type="datetime-local" value={cancelScheduledAt}
                  onChange={e => setCancelScheduledAt(e.target.value)}
                  style={{ width: '100%', border: '0.5px solid #A5D6A7', borderRadius: 10, padding: '9px 11px', fontSize: 13, background: '#fff', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowCancelForm(false)}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 20, border: '1px solid #A5D6A7', background: '#fff', color: '#666', fontSize: 13, cursor: 'pointer', ...font }}>
                    閉じる
                  </button>
                  <button onClick={handleCancelSchedule} disabled={canceling}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 20, border: 'none', background: canceling ? '#E0E0E0' : '#E24B4A', color: canceling ? '#AAA' : '#fff', fontSize: 13, fontWeight: 600, cursor: canceling ? 'not-allowed' : 'pointer', ...font }}>
                    {canceling ? '処理中...' : '予約をキャンセル'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── フィードバック確認ボタン（修正中・完了・全承認時） ── */}
        {['in_revision', 'all_approved', 'completed'].includes(project.status) && latestFb && (
          <Link to={`/admin/projects/${id}/feedback`} style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
            <button style={{ width: '100%', padding: 14, borderRadius: 28, border: '1px solid #E0E0E0', background: '#fff', color: '#555', fontSize: 14, fontWeight: 600, cursor: 'pointer', ...font }}>
              フィードバックを確認する →
            </button>
          </Link>
        )}

        {/* ── 修正対応パネル（in_revision のとき） ── */}
        {project.status === 'in_revision' && (
          <div style={{ ...card, border: '0.5px solid #B3D4F5' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0055BB', marginBottom: 4 }}>修正対応中</p>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.6 }}>
              内容を修正してから「再確認を依頼する」を押してください。
            </p>

            {/* NG写真の差し替え */}
            {ngPhotos.length > 0 && (<>
              <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>NG写真の修正</p>
              {ngPhotos.map((photo) => {
                const photoFb = latestFb?.photoFeedbacks?.[photo.id];
                const rev     = revisionPhotos[photo.id];
                const inputId = `rev-${photo.id}`;
                return (
                  <div key={photo.id} style={{ marginBottom: 10, padding: '12px', background: '#F5F9FF', borderRadius: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rev ? 10 : 0 }}>
                      <div style={{ width: 44, height: 55, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#E8E8E8', position: 'relative' }}>
                        {(photo.thumbnailUrl || photo.storageUrl) && (
                          <img src={photo.thumbnailUrl || photo.storageUrl} alt=""
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 2 }}>写真 {mainPhotos.indexOf(photo) + 1}</p>
                        {photoFb?.comment && <p style={{ fontSize: 11, color: '#AAA', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photoFb.comment}</p>}
                      </div>
                      <label htmlFor={inputId}
                        style={{ padding: '7px 12px', borderRadius: 16, border: 'none', background: rev ? '#E6F9F0' : GRAD, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, ...font }}>
                        {rev ? '✓ 選択済み' : '差し替え'}
                      </label>
                      <input id={inputId} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => e.target.files[0] && stageRevisionPhoto(photo.id, e.target.files[0])} />
                    </div>
                    {rev && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '0.5px solid #D4E8FB' }}>
                        <div style={{ width: 44, height: 55, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#E8E8E8', position: 'relative', border: '1.5px solid #833AB4' }}>
                          <img src={rev.preview} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 11, color: '#00A651', fontWeight: 600, margin: 0 }}>新しい写真を選択済み</p>
                          <p style={{ fontSize: 10, color: '#AAA', margin: 0 }}>{rev.file.name}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ height: 1, background: '#E8F4FD', margin: '14px 0' }} />
            </>)}

            {/* 差し替え候補写真 */}
            <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>差し替え候補写真</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {/* 既存の候補写真 */}
              {altPhotos.map((alt, ai) => {
                const markedForDelete = altToDelete.includes(alt.id);
                return (
                  <div key={alt.id} style={{ position: 'relative', width: 72, flexShrink: 0 }}>
                    <div style={{ width: 72, height: 90, borderRadius: 10, overflow: 'hidden', background: '#E8E8E8', position: 'relative',
                      opacity: markedForDelete ? 0.35 : 1,
                      border: markedForDelete ? '1.5px dashed #E24B4A' : '1.5px solid #E8E8E8' }}>
                      {(alt.thumbnailUrl || alt.storageUrl) && (
                        <img src={alt.thumbnailUrl || alt.storageUrl} alt=""
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 9, color: '#888', marginTop: 3 }}>候補{String.fromCharCode(65 + ai)}</div>
                    <button
                      onClick={() => setAltToDelete(prev => markedForDelete ? prev.filter(x => x !== alt.id) : [...prev, alt.id])}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none',
                        background: markedForDelete ? '#888' : '#E24B4A', color: '#fff', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      {markedForDelete ? '↩' : '✕'}
                    </button>
                  </div>
                );
              })}
              {/* 新規追加した候補写真 */}
              {newAltFiles.map((item) => (
                <div key={item.id} style={{ position: 'relative', width: 72, flexShrink: 0 }}>
                  <div style={{ width: 72, height: 90, borderRadius: 10, overflow: 'hidden', background: '#E8E8E8', position: 'relative', border: '1.5px solid #833AB4' }}>
                    <img src={item.preview} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 9, color: '#833AB4', marginTop: 3, fontWeight: 600 }}>新規</div>
                  <button
                    onClick={() => setNewAltFiles(prev => prev.filter(x => x.id !== item.id))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none',
                      background: '#E24B4A', color: '#fff', fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              ))}
              {/* 追加ボタン */}
              <label style={{ width: 72, height: 90, borderRadius: 10, border: '1.5px dashed #CCC', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#FAFAFA', flexShrink: 0 }}>
                <span style={{ fontSize: 22, color: '#CCC', lineHeight: 1 }}>＋</span>
                <span style={{ fontSize: 9, color: '#CCC', marginTop: 4 }}>候補を追加</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files);
                    setNewAltFiles(prev => [...prev, ...files.map(f => ({ id: uuidv4(), file: f, preview: URL.createObjectURL(f) }))]);
                    e.target.value = '';
                  }} />
              </label>
            </div>

            <div style={{ height: 1, background: '#E8F4FD', margin: '14px 0' }} />

            {/* キャプション・ハッシュタグ */}
            <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>キャプション・ハッシュタグ</p>
            <textarea value={captionEdit} onChange={e => setCaptionEdit(e.target.value)} rows={4} placeholder="キャプション"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '0.5px solid #E8E8E8', fontSize: 13, resize: 'vertical', ...font, boxSizing: 'border-box', color: '#333', background: '#FAFAFA', marginBottom: 8 }} />
            <textarea value={hashtagEdit} onChange={e => setHashtagEdit(e.target.value)} rows={2} placeholder="#ハッシュタグ"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '0.5px solid #E8E8E8', fontSize: 13, resize: 'vertical', ...font, boxSizing: 'border-box', color: '#833AB4', background: '#FAFAFA', marginBottom: 14 }} />

            <button onClick={handleReconfirmRequest} disabled={reconfirming}
              style={{ width: '100%', padding: 13, borderRadius: 28, border: 'none',
                background: reconfirming ? '#E0E0E0' : GRAD,
                color: reconfirming ? '#AAA' : '#fff',
                fontSize: 14, fontWeight: 700, cursor: reconfirming ? 'not-allowed' : 'pointer', ...font }}>
              {reconfirming ? 'アップロード中...' : '📤 再確認を依頼する'}
            </button>
          </div>
        )}

        {/* ── 写真グリッド ── */}
        <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>
          投稿予定写真（{mainPhotos.length}枚）
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
          {mainPhotos.map((photo, i) => {
            const isOk = photo.currentStatus === 'ok';
            const isNg = photo.currentStatus === 'ng';
            return (
              <div key={photo.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '4/5', background: '#F0F0F0', border: '0.5px solid #E8E8E8' }}>
                {(photo.thumbnailUrl || photo.storageUrl) && (
                  <img src={photo.thumbnailUrl || photo.storageUrl} alt={`写真${i+1}`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
                <span style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8 }}>{i+1}</span>
                {(isOk || isNg) && (
                  <span style={{ position: 'absolute', bottom: 5, left: 5, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                    background: isOk ? '#E6F9F0' : '#FFEBEB', color: isOk ? '#00A651' : '#E24B4A' }}>
                    {isOk ? 'OK' : 'NG'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {altPhotos.length > 0 && (<>
          <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>差し替え候補（{altPhotos.length}枚）</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
            {altPhotos.map((photo, i) => (
              <div key={photo.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '4/5', background: '#F0F0F0', border: '1.5px dashed #CCC' }}>
                {(photo.thumbnailUrl || photo.storageUrl) && (
                  <img src={photo.thumbnailUrl || photo.storageUrl} alt={`候補${i+1}`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                )}
                <span style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8 }}>候補{String.fromCharCode(64+i+1)}</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ── キャプション・ハッシュタグ ── */}
        <div style={card}>
          <label style={lbl}>キャプション</label>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: project.hashtags ? 10 : 0, whiteSpace: 'pre-wrap' }}>
            {project.caption || <span style={{ color: '#CCC' }}>未入力</span>}
          </p>
          {project.hashtags && (
            <p style={{ fontSize: 13, color: '#833AB4', lineHeight: 1.6, margin: 0 }}>{project.hashtags}</p>
          )}
        </div>

        {/* ── 確認URL ── */}
        <div style={card}>
          <label style={lbl}>確認URL</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input type="text" readOnly value={confirmUrl}
              style={{ flex: 1, border: '0.5px solid #E8E8E8', borderRadius: 10, padding: '9px 11px', fontSize: 11, color: '#888', background: '#F7F7F7', fontFamily: 'inherit' }} />
            <button onClick={copyUrl}
              style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: GRAD, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...font }}>
              {copied ? '✓' : 'コピー'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={shareLine}
              style={{ flex: 1, padding: '10px 0', borderRadius: 20, border: '0.5px solid #E8E8E8', background: '#fff', fontSize: 13, cursor: 'pointer', ...font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#1a1a1a' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06C755" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              LINEで送る
            </button>
            <button onClick={copyUrl}
              style={{ flex: 1, padding: '10px 0', borderRadius: 20, border: '0.5px solid #E8E8E8', background: '#fff', fontSize: 13, cursor: 'pointer', ...font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#1a1a1a' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              URLをコピー
            </button>
          </div>
        </div>

        {/* ── テスト投稿 ── */}
        <div style={card}>
          <button onClick={handleTestPost}
            disabled={igTesting}
            style={{ width: '100%', padding: '10px 0', borderRadius: 20, border: '0.5px solid #E8E8E8',
              cursor: igTesting ? 'not-allowed' : 'pointer',
              background: '#fff', color: igTesting ? '#AAA' : '#555',
              fontSize: 13, fontWeight: 600, ...font }}>
            {igTesting ? '投稿中...' : 'テスト投稿する'}
          </button>
          <p style={{ fontSize: 10, color: '#BBB', textAlign: 'center', marginTop: 5 }}>
            システム設定のInstagramアカウントに実際に投稿します
          </p>
          {igTestResult && (
            <div style={{
              marginTop: 8, padding: '10px 14px', borderRadius: 12,
              background: igTestResult.ok ? '#E6F9F0' : '#FFEBEB',
              color: igTestResult.ok ? '#00A651' : '#E24B4A',
              fontSize: 12, fontWeight: 600,
            }}>
              {igTestResult.ok
                ? `✓ 投稿成功！ メディアID: ${igTestResult.mediaId}`
                : `✗ ${igTestResult.error}`}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
