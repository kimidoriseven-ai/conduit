import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, orderBy, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { toast } from '../../components/Toast';
import usePageTitle from '../../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

export default function FeedbackPage() {
  usePageTitle('フィードバック');
  const { id } = useParams();
  const navigate = useNavigate();

  const [project,        setProject]        = useState(null);
  const [mainPhotos,     setMainPhotos]     = useState([]);
  const [altPhotos,      setAltPhotos]      = useState([]);
  const [feedbackRounds, setFeedbackRounds] = useState([]);
  const [selectedRound,  setSelectedRound]  = useState(null);
  const [selectedRoundNum, setSelectedRoundNum] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [startingRevision, setStartingRevision] = useState(false);

  useEffect(() => {
    let unsubscribeFb;

    async function load() {
      try {
        const pSnap = await getDoc(doc(db, 'projects', id));
        if (pSnap.exists()) setProject({ id: pSnap.id, ...pSnap.data() });

        const photosSnap = await getDocs(collection(db, 'projects', id, 'photos'));
        const all = photosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMainPhotos(all.filter(p => p.type === 'main').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        setAltPhotos(all.filter(p => p.type === 'alternative').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

        // リアルタイムで feedbackRounds を監視（複数レビュアーが送信するたびに自動更新）
        const fbQ = query(collection(db, 'projects', id, 'feedbackRounds'), orderBy('round', 'desc'));
        let isFirst = true;
        unsubscribeFb = onSnapshot(fbQ, snapshot => {
          const rounds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setFeedbackRounds(rounds);
          if (isFirst) {
            if (rounds.length > 0) {
              setSelectedRound(rounds[0]);
              setSelectedRoundNum(rounds[0].round);
            }
            isFirst = false;
          }
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { if (unsubscribeFb) unsubscribeFb(); };
  }, [id]);

  async function handleStartRevision() {
    setStartingRevision(true);
    try {
      await updateDoc(doc(db, 'projects', id), {
        status: 'in_revision',
        updatedAt: serverTimestamp(),
      });
      navigate(`/admin/projects/${id}`);
    } catch (e) {
      console.error(e);
      toast('ステータスの更新に失敗しました。');
      setStartingRevision(false);
    }
  }

  const font = { fontFamily: '-apple-system, "Hiragino Sans", sans-serif' };
  const lbl  = { display: 'block', fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#BBB', ...font }}>読み込み中...</div>;

  const roundGroups = feedbackRounds.reduce((acc, r) => {
    if (!acc[r.round]) acc[r.round] = [];
    acc[r.round].push(r);
    return acc;
  }, {});
  const roundNums = Object.keys(roundGroups).map(Number).sort((a, b) => b - a);
  const roundDocs = roundGroups[selectedRoundNum] || [];

  const fb          = selectedRound?.photoFeedbacks || {};
  const submittedAt = selectedRound?.submittedAt?.toDate
    ? selectedRound.submittedAt.toDate().toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const altMap = {};
  altPhotos.forEach((p, i) => { altMap[p.id] = { ...p, label: `候補${String.fromCharCode(65 + i)}` }; });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', background: '#F5F5F5', minHeight: '100vh', ...font }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to={`/admin/projects/${id}`} style={{ fontSize: 26, color: '#999', textDecoration: 'none', lineHeight: 1, padding: '2px 8px 2px 0' }}>‹</Link>
        <span style={{ fontSize: 15, fontWeight: 600 }}>フィードバック確認</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '14px 14px 48px' }}>

        {/* フィードバックなし */}
        {feedbackRounds.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '48px 20px', textAlign: 'center', color: '#CCC' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            <p style={{ margin: 0, fontSize: 13 }}>まだフィードバックはありません</p>
          </div>
        )}

        {selectedRound && (<>

          {/* ── ラウンド切り替え ── */}
          {roundNums.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: roundDocs.length > 1 ? 8 : 12, flexWrap: 'wrap' }}>
              {roundNums.map(rn => {
                const active = selectedRoundNum === rn;
                return (
                  <button key={rn} onClick={() => { setSelectedRoundNum(rn); setSelectedRound(roundGroups[rn][0]); }}
                    style={{ padding: '7px 16px', borderRadius: 20, border: active ? 'none' : '1px solid #E0E0E0', background: active ? GRAD : '#fff', color: active ? '#fff' : '#888', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', ...font }}>
                    第{rn}回
                  </button>
                );
              })}
            </div>
          )}

          {/* ── レビュアー切り替え ── */}
          {roundDocs.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {roundDocs.map(d => {
                const active = selectedRound?.id === d.id;
                const name = d.reviewerName || '（名前なし）';
                return (
                  <button key={d.id} onClick={() => setSelectedRound(d)}
                    style={{ padding: '5px 14px', borderRadius: 20, border: active ? 'none' : '1px solid #E0E0E0', background: active ? '#444' : '#fff', color: active ? '#fff' : '#888', fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', ...font }}>
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── サマリーバナー ── */}
          <div style={{ borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12,
            background: selectedRound.isAllApproved ? '#E6F9F0' : '#FFF5F5',
            border: `0.5px solid ${selectedRound.isAllApproved ? '#A5D6A7' : '#F09595'}` }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: selectedRound.isAllApproved ? '#00A651' : '#E24B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 16 }}>{selectedRound.isAllApproved ? '✓' : '!'}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 3,
                color: selectedRound.isAllApproved ? '#00A651' : '#E24B4A' }}>
                {selectedRound.isAllApproved
                  ? '全写真が承認されました'
                  : `NG ${selectedRound.rejectedCount}枚 — 修正が必要です`}
              </p>
              <p style={{ fontSize: 11, color: '#AAA' }}>
                {selectedRound.reviewerName && `${selectedRound.reviewerName} · `}OK：{selectedRound.approvedCount}枚　NG：{selectedRound.rejectedCount}枚　受信：{submittedAt}
              </p>
            </div>
          </div>

          {/* ── 管理者アクション（feedback_received 時のみ） ── */}
          {project?.status === 'feedback_received' && !selectedRound.isAllApproved && (
            <div style={{ background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '16px', marginBottom: 14 }}>
              <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.6 }}>
                フィードバックを確認したら、NG写真の修正作業を開始してください。
              </p>
              <button
                onClick={handleStartRevision}
                disabled={startingRevision}
                style={{
                  width: '100%', padding: 13, borderRadius: 28, border: 'none',
                  background: startingRevision ? '#E0E0E0' : GRAD,
                  color: startingRevision ? '#AAA' : '#fff',
                  fontSize: 14, fontWeight: 700, cursor: startingRevision ? 'not-allowed' : 'pointer', ...font,
                }}>
                {startingRevision ? '処理中...' : '✏️ 修正対応を開始する'}
              </button>
            </div>
          )}

          {/* ── 全体コメント ── */}
          {selectedRound.overallComment && (
            <div style={{ background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '14px 16px', marginBottom: 12 }}>
              <label style={lbl}>全体コメント</label>
              <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: 0 }}>{selectedRound.overallComment}</p>
            </div>
          )}

          {/* ── キャプション・ハッシュタグ修正案 ── */}
          {(selectedRound.captionEdit || selectedRound.hashtagEdit) && (
            <div style={{ background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '14px 16px', marginBottom: 12 }}>
              {selectedRound.captionEdit && (<>
                <label style={lbl}>キャプション修正案</label>
                <p style={{ fontSize: 13, color: '#444', lineHeight: 1.7, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{selectedRound.captionEdit}</p>
              </>)}
              {selectedRound.hashtagEdit && (<>
                <label style={lbl}>ハッシュタグ修正案</label>
                <p style={{ fontSize: 13, color: '#833AB4', lineHeight: 1.7, margin: 0 }}>{selectedRound.hashtagEdit}</p>
              </>)}
            </div>
          )}

          {/* ── 写真ごとのフィードバック ── */}
          {mainPhotos.map((photo, i) => {
            const photoFb  = fb[photo.id];
            if (!photoFb) return null;
            const isOk     = photoFb.status === 'ok';
            const isNg     = photoFb.status === 'ng';
            const replaceAlt = photoFb.replaceWithPhotoId ? altMap[photoFb.replaceWithPhotoId] : null;
            const hasDrawing = !!photoFb.drawingStorageUrl;

            return (
              <div key={photo.id} style={{
                background: isNg ? '#FFF8F8' : '#fff',
                borderRadius: 18,
                border: `0.5px solid ${isNg ? '#F09595' : '#E8E8E8'}`,
                marginBottom: 10,
                overflow: 'hidden',
              }}>
                {/* 写真行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
                  <div style={{ width: 44, height: 55, borderRadius: 8, overflow: 'hidden', flexShrink: 0, position: 'relative', background: '#E8E8E8' }}>
                    {(photo.thumbnailUrl || photo.storageUrl) && (
                      <img src={photo.thumbnailUrl || photo.storageUrl} alt=""
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    {hasDrawing && (
                      <img src={photoFb.drawingStorageUrl} alt=""
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, color: '#AAA', marginBottom: 4 }}>写真 {i + 1}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                        background: isOk ? '#E6F9F0' : '#FFEBEB', color: isOk ? '#00A651' : '#E24B4A' }}>
                        {isOk ? '✓ OK' : '✗ NG'}
                      </span>
                      {hasDrawing && <span style={{ fontSize: 10, color: '#888' }}>✏ 書き込みあり</span>}
                      {replaceAlt && <span style={{ fontSize: 10, color: '#833AB4', fontWeight: 600 }}>→ {replaceAlt.label}に差し替え</span>}
                    </div>
                  </div>
                </div>

                {/* コメント */}
                {photoFb.comment && (
                  <div style={{ padding: '0 14px 12px', borderTop: '0.5px solid #F5F5F5' }}>
                    <p style={{ fontSize: 11, color: '#AAA', marginBottom: 4, marginTop: 10 }}>修正コメント</p>
                    <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7, margin: 0 }}>{photoFb.comment}</p>
                  </div>
                )}

                {/* キャプション修正（写真ごと） */}
                {photoFb.captionEdit && (
                  <div style={{ padding: '0 14px 12px', borderTop: '0.5px solid #F5F5F5' }}>
                    <p style={{ fontSize: 11, color: '#AAA', marginBottom: 4, marginTop: 10 }}>キャプション修正案</p>
                    <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, margin: 0 }}>{photoFb.captionEdit}</p>
                  </div>
                )}

                {/* 差し替え候補プレビュー */}
                {replaceAlt && (replaceAlt.thumbnailUrl || replaceAlt.storageUrl) && (
                  <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #F5F5F5' }}>
                    <p style={{ fontSize: 11, color: '#AAA', marginBottom: 8, marginTop: 10 }}>差し替え候補（{replaceAlt.label}）</p>
                    <div style={{ width: 80, borderRadius: 10, overflow: 'hidden', aspectRatio: '4/5', background: '#E8E8E8' }}>
                      <img src={replaceAlt.thumbnailUrl || replaceAlt.storageUrl} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  </div>
                )}

                {/* 書き込み拡大表示 */}
                {hasDrawing && (
                  <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #F5F5F5' }}>
                    <p style={{ fontSize: 11, color: '#AAA', marginBottom: 8, marginTop: 10 }}>書き込み内容</p>
                    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#E8E8E8' }}>
                      {(photo.thumbnailUrl || photo.storageUrl) && (
                        <img src={photo.thumbnailUrl || photo.storageUrl} alt="" style={{ width: '100%', display: 'block' }} />
                      )}
                      <img src={photoFb.drawingStorageUrl} alt="書き込み"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>)}
      </div>
    </div>
  );
}
