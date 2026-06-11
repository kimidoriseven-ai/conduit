import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs,
  doc, getDoc, addDoc, updateDoc, serverTimestamp,
  arrayUnion, increment,
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import usePageTitle from '../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';
const CANVAS_W = 800;
const CANVAS_H = 1000;

// ========== 手書きモーダル ==========
function DrawingModal({ photo, existingDataUrl, onSave, onClose }) {
  const canvasRef   = useRef(null);
  const isDrawRef   = useRef(false);
  const historyRef  = useRef([]);
  const snapshotRef = useRef(null);
  const startRef    = useRef({ x: 0, y: 0 });
  const toolRef     = useRef('pen');
  const colorRef    = useRef('#FF3B30');

  const [toolState,  setToolState]  = useState('pen');
  const [colorState, setColorState] = useState('#FF3B30');
  const [canUndo,    setCanUndo]    = useState(false);

  const pickTool  = t => { toolRef.current  = t; setToolState(t); };
  const pickColor = c => { colorRef.current = c; setColorState(c); };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const snapshot = () => { historyRef.current = [ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)]; setCanUndo(false); };
    if (existingDataUrl) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); snapshot(); };
      img.src = existingDataUrl;
    } else { snapshot(); }
  }, [existingDataUrl]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * (CANVAS_W / rect.width), y: (src.clientY - rect.top) * (CANVAS_H / rect.height) };
  }
  function startDraw(e) {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    isDrawRef.current = true; startRef.current = pos;
    const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    snapshotRef.current = snap; historyRef.current = [...historyRef.current, snap]; setCanUndo(true);
    if (toolRef.current === 'pen') { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.strokeStyle = colorRef.current; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  }
  function draw(e) {
    e.preventDefault(); if (!isDrawRef.current) return;
    const ctx = canvasRef.current.getContext('2d'); const pos = getPos(e);
    if (toolRef.current === 'pen') { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    else { ctx.putImageData(snapshotRef.current, 0, 0); const dx = pos.x - startRef.current.x, dy = pos.y - startRef.current.y, r = Math.sqrt(dx*dx+dy*dy); ctx.beginPath(); ctx.arc(startRef.current.x, startRef.current.y, r, 0, Math.PI*2); ctx.strokeStyle = colorRef.current; ctx.lineWidth = 10; ctx.stroke(); }
  }
  function endDraw(e) { e.preventDefault(); isDrawRef.current = false; }
  function undo() {
    if (historyRef.current.length <= 1) return;
    const hist = historyRef.current.slice(0, -1); historyRef.current = hist;
    canvasRef.current.getContext('2d').putImageData(hist[hist.length-1], 0, 0); setCanUndo(hist.length > 1);
  }
  const tb = { padding: '7px 13px', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.9)', flexShrink: 0 }}>
        {['pen','circle'].map(t => (
          <button key={t} onClick={() => pickTool(t)} style={{ ...tb, border: toolState===t ? '2px solid #fff' : '1px solid #555', fontWeight: toolState===t ? 700 : 400 }}>
            {t==='pen' ? '✏️ ペン' : '⭕ 丸'}
          </button>
        ))}
        {['#FF3B30','#FFFFFF'].map(c => (
          <div key={c} onClick={() => pickColor(c)} style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer', flexShrink:0, border: colorState===c ? `3px solid ${c==='#FFFFFF'?'#aaa':'#fff'}` : '2px solid #555' }} />
        ))}
        <button onClick={undo} disabled={!canUndo} style={{ ...tb, border:'1px solid #555', marginLeft:'auto', color: canUndo?'#fff':'#555', cursor: canUndo?'pointer':'default' }}>↩ 戻す</button>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        <div style={{ position:'relative', width:'100%', maxWidth:480, aspectRatio:'4/5' }}>
          <img src={photo.thumbnailUrl||photo.storageUrl} alt="" draggable="false"
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none', userSelect:'none' }} />
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', touchAction:'none', cursor:'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        </div>
      </div>
      <div style={{ padding:'12px 16px 40px', background:'rgba(0,0,0,0.9)', display:'flex', gap:10, flexShrink:0 }}>
        <button onClick={onClose} style={{ flex:1, padding:13, borderRadius:20, border:'1px solid #555', background:'transparent', color:'#fff', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
        <button onClick={() => onSave(canvasRef.current.toDataURL('image/png'))} style={{ flex:2, padding:13, borderRadius:20, border:'none', background:GRAD, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>この書き込みを使う</button>
      </div>
    </div>
  );
}

// ========== メインページ ==========
export default function ConfirmPage() {
  usePageTitle('投稿のご確認');
  const { token } = useParams();
  const navigate  = useNavigate();

  const [screen,         setScreen]         = useState('name');
  const [reviewerName,   setReviewerName]   = useState('');
  const [project,        setProject]        = useState(null);
  const [mainPhotos,     setMainPhotos]     = useState([]);
  const [altPhotos,      setAltPhotos]      = useState([]);
  const [feedbacks,      setFeedbacks]      = useState({});
  const [prevRounds,     setPrevRounds]     = useState([]);
  const [overallComment, setOverallComment] = useState('');
  const [captionEdit,    setCaptionEdit]    = useState('');
  const [hashtagEdit,    setHashtagEdit]    = useState('');
  const [loading,        setLoading]        = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState(null);
  const [drawingPhotoId, setDrawingPhotoId] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // confirmLinks/{token} で projectId を引く（projects の list はルールで禁止）
        const linkSnap = await getDoc(doc(db, 'confirmLinks', token));
        if (!linkSnap.exists()) { navigate('/invalid-url'); return; }
        const pSnap = await getDoc(doc(db, 'projects', linkSnap.data().projectId));
        if (!pSnap.exists()) { navigate('/invalid-url'); return; }
        const pData = { id: pSnap.id, ...pSnap.data() };
        if (pData.confirmTokenExpiresAt?.toDate() < new Date()) { navigate('/invalid-url'); return; }
        setProject(pData);
        setCaptionEdit(pData.caption  || '');
        setHashtagEdit(pData.hashtags || '');
        const mainQ = query(collection(db, 'projects', pData.id, 'photos'), where('type', '==', 'main'));
        const altQ  = query(collection(db, 'projects', pData.id, 'photos'), where('type', '==', 'alternative'));
        const [mSnap, aSnap] = await Promise.all([getDocs(mainQ), getDocs(altQ)]);
        const mList = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.order??0)-(b.order??0));
        const aList = aSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.order??0)-(b.order??0));
        setMainPhotos(mList);
        setAltPhotos(aList);
        try {
          const rSnap  = await getDocs(collection(db, 'projects', pData.id, 'feedbackRounds'));
          const rounds = rSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.submittedAt?.toMillis() ?? 0) - (b.submittedAt?.toMillis() ?? 0));
          setPrevRounds(rounds);
        } catch { /* 読めなくても確認フロー自体は継続する */ }
        const init = {};
        mList.forEach(p => { init[p.id] = { status:'pending', comment:'', drawingDataUrl:null, replaceWithPhotoId:null }; });
        setFeedbacks(init);
      } catch (e) { console.error(e); setError('データの読み込みに失敗しました。'); }
      finally { setLoading(false); }
    }
    load();
  }, [token, navigate]);

  const updateFb = (photoId, field, value) =>
    setFeedbacks(prev => ({ ...prev, [photoId]: { ...prev[photoId], [field]: value } }));

  const okCount   = Object.values(feedbacks).filter(f => f.status === 'ok').length;
  const ngCount   = Object.values(feedbacks).filter(f => f.status === 'ng').length;
  const allJudged = mainPhotos.length > 0 && mainPhotos.every(p => feedbacks[p.id]?.status !== 'pending');

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const round = project.currentRound || 1;
      const photoFeedbacks = {};
      for (const photo of mainPhotos) {
        const fb = feedbacks[photo.id];
        let drawingStorageUrl = null;
        if (fb.drawingDataUrl) {
          const r = ref(storage, `projects/${project.id}/drawings/${photo.id}_r${round}_${Date.now()}.png`);
          await uploadString(r, fb.drawingDataUrl, 'data_url');
          drawingStorageUrl = await getDownloadURL(r);
        }
        photoFeedbacks[photo.id] = { photoId: photo.id, status: fb.status, comment: fb.comment||'', drawingStorageUrl, captionEdit: captionEdit !== project.caption ? captionEdit : null, replaceWithPhotoId: fb.replaceWithPhotoId||null };
      }
      // 過去のレビュアーのNGも含めて判定（1人でもNGがあれば全承認にしない）
      const existingNgCount = project.ngPhotoIds?.length ?? 0;
      const currentNgCount  = mainPhotos.filter(p => feedbacks[p.id]?.status === 'ng').length;
      const isAllApproved   = existingNgCount === 0 && currentNgCount === 0;
      await addDoc(collection(db, 'projects', project.id, 'feedbackRounds'), {
        projectId: project.id,
        round,
        reviewerName: reviewerName.trim() || '（名前なし）',
        submittedAt: serverTimestamp(),
        overallComment,
        captionEdit: captionEdit !== (project.caption || '') ? captionEdit : null,
        hashtagEdit: hashtagEdit !== (project.hashtags || '') ? hashtagEdit : null,
        totalMainPhotos: mainPhotos.length,
        approvedCount: okCount,
        rejectedCount: ngCount,
        isAllApproved,
        photoFeedbacks,
      });
      for (const photo of mainPhotos) {
        const fb = feedbacks[photo.id];
        await updateDoc(doc(db, 'projects', project.id, 'photos', photo.id), { currentStatus: fb.status, latestRound: round, updatedAt: serverTimestamp() });
      }
      const ngPhotoIds = mainPhotos.filter(p => feedbacks[p.id]?.status === 'ng').map(p => p.id);
      await updateDoc(doc(db, 'projects', project.id), {
        status: isAllApproved ? 'all_approved' : 'feedback_received',
        reviewerCount: increment(1),
        ...(ngPhotoIds.length > 0 ? { ngPhotoIds: arrayUnion(...ngPhotoIds) } : {}),
        lastFeedbackAt: serverTimestamp(),
        ...(isAllApproved ? { allApprovedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });
      navigate(`/confirm/${token}/complete`);
    } catch (e) { console.error(e); setError('送信に失敗しました。もう一度お試しください。'); setSubmitting(false); }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#BBB', fontFamily:'-apple-system,sans-serif' }}>読み込み中...</div>;
  if (error)   return <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', height:'100vh', color:'#E24B4A', fontFamily:'-apple-system,sans-serif', padding:24, textAlign:'center', gap:12 }}><div style={{ fontSize:36 }}>⚠️</div><p style={{ margin:0 }}>{error}</p></div>;

  const font = { fontFamily: '-apple-system, "Hiragino Sans", sans-serif' };

  // ───── 名前入力画面 ─────
  if (screen === 'name') {
    const deadlineDate = project?.confirmTokenExpiresAt?.toDate();
    const deadlineStr  = deadlineDate
      ? deadlineDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
      : '';
  return (
    <div style={{ ...font, maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 28px' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:GRAD, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/>
        </svg>
      </div>
      <p style={{ fontSize:11, color:'#BBB', fontWeight:700, letterSpacing:'0.12em', marginBottom:10 }}>INSTAGRAM 投稿確認</p>
      <h1 style={{ fontSize:20, fontWeight:700, color:'#1a1a1a', textAlign:'center', margin:'0 0 10px', lineHeight:1.5 }}>
        お名前を教えてください
      </h1>
      <p style={{ fontSize:13, color:'#888', textAlign:'center', margin:'0 0 28px', lineHeight:1.6 }}>
        どなたが確認されたか記録するために使用します
      </p>
      {prevRounds.length > 0 && (
        <p style={{ fontSize:12, color:'#888', background:'#F7F7F7', borderRadius:12, padding:'10px 14px', margin:'0 0 20px', textAlign:'center', lineHeight:1.6, width:'100%', boxSizing:'border-box' }}>
          {prevRounds.map(r => `${r.reviewerName}さん`).join('・')} が確認済みです
        </p>
      )}
      <div style={{ width:'100%', marginBottom:24 }}>
        <input
          type="text"
          value={reviewerName}
          onChange={e => setReviewerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && reviewerName.trim() && setScreen('welcome')}
          placeholder="例：田中"
          autoFocus
          style={{ width:'100%', padding:'13px 16px', borderRadius:12, border:'1.5px solid #E8E8E8', boxSizing:'border-box', ...font, color:'#1a1a1a', background:'#FAFAFA' }}
        />
      </div>
      <button
        onClick={() => reviewerName.trim() && setScreen('welcome')}
        disabled={!reviewerName.trim()}
        style={{ width:'100%', padding:15, borderRadius:28, border:'none',
          background: reviewerName.trim() ? GRAD : '#E8E8E8',
          color: reviewerName.trim() ? '#fff' : '#BBB',
          fontSize:16, fontWeight:700, cursor: reviewerName.trim() ? 'pointer' : 'not-allowed', ...font }}>
        次へ →
      </button>
      {deadlineStr && (
        <p style={{ fontSize:11, color:'#CCC', margin:'18px 0 0', textAlign:'center' }}>
          確認期限：{deadlineStr}まで
        </p>
      )}
      <a href="/manual.html" target="_blank" rel="noopener noreferrer"
        style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:20, fontSize:12, color:'#AAA', textDecoration:'none' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        確認の仕方がわからない方はこちら
      </a>
    </div>
  );
  }

  // ───── ウェルカム画面 ─────
  if (screen === 'welcome') {
    const expires = project?.confirmTokenExpiresAt?.toDate();
    const expStr  = expires ? expires.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' }) : '';
    return (
      <div style={{ ...font, maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 28px' }}>
        {/* アイコン */}
        <div style={{ width:64, height:64, borderRadius:'50%', background:GRAD, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:18 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/>
          </svg>
        </div>
        <p style={{ fontSize:11, color:'#BBB', fontWeight:700, letterSpacing:'0.12em', marginBottom:10 }}>INSTAGRAM 投稿確認</p>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#1a1a1a', textAlign:'center', margin:'0 0 28px', lineHeight:1.5 }}>
          投稿をご確認ください
        </h1>
        {/* 説明カード */}
        <div style={{ width:'100%', background:'#F7F7F7', borderRadius:16, padding:'16px 18px', marginBottom:14 }}>
          <p style={{ fontSize:13, color:'#555', lineHeight:1.8, margin:0 }}>
            {mainPhotos.length}枚の写真をご確認いただき、各写真にOKかNGをお知らせください。気になる部分は写真に直接書き込んでお伝えいただけます。
          </p>
        </div>
        {/* 確認済みの方 */}
        {prevRounds.length > 0 && (
          <div style={{ width:'100%', border:'1px solid #EEE', borderRadius:16, padding:'14px 18px', marginBottom:28, boxSizing:'border-box' }}>
            <p style={{ fontSize:11, color:'#AAA', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 8px' }}>確認済みの方（{prevRounds.length}名）</p>
            {prevRounds.map(r => (
              <p key={r.id} style={{ fontSize:13, color:'#555', margin:'4px 0', lineHeight:1.6 }}>
                {r.reviewerName}さん — OK {r.approvedCount}枚{r.rejectedCount > 0 ? `・NG ${r.rejectedCount}枚` : ''}
              </p>
            ))}
          </div>
        )}
        <button onClick={() => setScreen('review')}
          style={{ width:'100%', padding:'15px', borderRadius:28, border:'none', background:GRAD, color:'#fff', fontSize:16, fontWeight:700, cursor:'pointer', ...font, marginBottom:16 }}>
          確認をはじめる
        </button>
        {expStr && <p style={{ fontSize:11, color:'#CCC', margin:0 }}>有効期限：{expStr}まで</p>}
      </div>
    );
  }

  // ───── 送信確認画面 ─────
  if (screen === 'confirm') return (
    <div style={{ ...font, maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#fff' }}>
      {/* ヘッダー */}
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'0.5px solid #E8E8E8', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <button onClick={() => setScreen('review')} style={{ background:'none', border:'none', fontSize:22, color:'#999', cursor:'pointer', padding:'0 12px 0 0', lineHeight:1 }}>‹</button>
        <span style={{ fontSize:15, fontWeight:600, color:'#1a1a1a' }}>送信確認</span>
      </div>

      <div style={{ padding:'24px 16px' }}>
        <h2 style={{ fontSize:18, fontWeight:700, margin:'0 0 4px' }}>この内容で送信しますか？</h2>
        <p style={{ fontSize:12, color:'#AAA', margin:'0 0 20px' }}>送信後は変更できません</p>

        {/* 写真サマリー */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
          {mainPhotos.map((photo, i) => {
            const fb = feedbacks[photo.id] || {};
            const isOk = fb.status === 'ok';
            const isNg = fb.status === 'ng';
            const alt = altPhotos.find(a => a.id === fb.replaceWithPhotoId);
            return (
              <div key={photo.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#F7F7F7', borderRadius:12 }}>
                {/* サムネイル */}
                <div style={{ width:40, height:40, borderRadius:8, overflow:'hidden', flexShrink:0, background:'#E0E0E0' }}>
                  {(photo.thumbnailUrl||photo.storageUrl) && <img src={photo.thumbnailUrl||photo.storageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:600, margin:'0 0 2px', color:'#1a1a1a' }}>写真 {i+1}</p>
                  {isNg && alt && <p style={{ fontSize:11, color:'#AAA', margin:0 }}>候補{altPhotos.indexOf(alt)===0?'A':'B'}に差し替え</p>}
                  {isNg && !alt && fb.replaceWithPhotoId === null && fb.comment && <p style={{ fontSize:11, color:'#AAA', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{fb.comment}</p>}
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:12, flexShrink:0,
                  background: isOk ? '#E6F9F0' : isNg ? '#FFEBEB' : '#F0F0F0',
                  color: isOk ? '#00A651' : isNg ? '#E24B4A' : '#999',
                }}>
                  {isOk ? '✓ OK' : isNg ? '✗ NG' : '未確認'}
                </span>
              </div>
            );
          })}
        </div>

        {/* キャプション */}
        {captionEdit && (
          <div style={{ padding:'12px 14px', background:'#F7F7F7', borderRadius:12, marginBottom:20 }}>
            <p style={{ fontSize:10, color:'#AAA', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 6px' }}>キャプション</p>
            <p style={{ fontSize:13, color:'#555', margin:0, lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{captionEdit}</p>
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width:'100%', padding:15, borderRadius:28, border:'none', background: submitting?'#E0E0E0':GRAD, color: submitting?'#AAA':'#fff', fontSize:16, fontWeight:700, cursor: submitting?'not-allowed':'pointer', ...font, marginBottom:10 }}>
          {submitting ? '送信中...' : '送信する'}
        </button>
        <button onClick={() => setScreen('review')}
          style={{ width:'100%', padding:14, borderRadius:28, border:'1px solid #E0E0E0', background:'#fff', color:'#888', fontSize:14, cursor:'pointer', ...font }}>
          戻って確認する
        </button>
      </div>
    </div>
  );

  // ───── レビュー画面 ─────
  const drawingPhoto = drawingPhotoId ? mainPhotos.find(p => p.id === drawingPhotoId) : null;

  return (
    <div style={{ ...font, maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#fff' }}>

      {/* 手書きモーダル */}
      {drawingPhoto && (
        <DrawingModal photo={drawingPhoto} existingDataUrl={feedbacks[drawingPhotoId]?.drawingDataUrl||null}
          onSave={dataUrl => { updateFb(drawingPhotoId, 'drawingDataUrl', dataUrl); setDrawingPhotoId(null); }}
          onClose={() => setDrawingPhotoId(null)} />
      )}

      {/* ─── 固定ヘッダー ─── */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'#fff', borderBottom:'0.5px solid #E8E8E8' }}>
        <div style={{ display:'flex', alignItems:'center', padding:'14px 16px 10px' }}>
          <button onClick={() => setScreen('welcome')} style={{ background:'none', border:'none', fontSize:22, color:'#999', cursor:'pointer', padding:'0 12px 0 0', lineHeight:1 }}>‹</button>
          <span style={{ fontSize:15, fontWeight:600, color:'#1a1a1a' }}>投稿内容を確認する</span>
        </div>
        {/* 進捗バー */}
        <div style={{ padding:'0 16px 10px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'#888', whiteSpace:'nowrap' }}>{okCount+ngCount}枚 確認済み / 全{mainPhotos.length}枚</span>
          <div style={{ flex:1, height:3, background:'#E8E8E8', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${mainPhotos.length>0?((okCount+ngCount)/mainPhotos.length)*100:0}%`, background:GRAD, transition:'width 0.3s' }} />
          </div>
          <span style={{ fontSize:12, color:'#BBB', whiteSpace:'nowrap' }}>残り{mainPhotos.length-okCount-ngCount}枚</span>
        </div>
      </div>

      {/* ─── 確認済みの方（他の確認者のサマリー） ─── */}
      {prevRounds.length > 0 && (
        <div style={{ margin:'14px 16px 0', background:'#F7F7F7', borderRadius:14, padding:'12px 14px' }}>
          <p style={{ fontSize:11, color:'#888', fontWeight:700, letterSpacing:'0.06em', margin:0 }}>👥 確認済みの方（{prevRounds.length}名）</p>
          {prevRounds.map(r => {
            const t  = r.submittedAt?.toDate();
            const ts = t ? t.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' }) : '';
            return (
              <div key={r.id} style={{ borderTop:'1px solid #EEE', padding:'8px 0 2px', marginTop:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#1a1a1a' }}>{r.reviewerName}さん</span>
                  <span style={{ fontSize:10, color:'#BBB' }}>{ts}</span>
                </div>
                <p style={{ fontSize:12, margin:'3px 0 0' }}>
                  <span style={{ color:'#00A651', fontWeight:600 }}>OK {r.approvedCount}枚</span>
                  {r.rejectedCount > 0 && <span style={{ color:'#E24B4A', fontWeight:600 }}>　NG {r.rejectedCount}枚</span>}
                </p>
                {r.overallComment && <p style={{ fontSize:12, color:'#888', margin:'4px 0 0', lineHeight:1.6 }}>「{r.overallComment}」</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 写真セクション一覧 ─── */}
      {mainPhotos.map((photo, index) => {
        const fb   = feedbacks[photo.id] || {};
        const isOk = fb.status === 'ok';
        const isNg = fb.status === 'ng';

        return (
          <div key={photo.id}>
            {/* 写真（全幅） */}
            <div style={{ position:'relative', background:'#1a1a1a', minHeight: 200, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {(photo.thumbnailUrl||photo.storageUrl)
                ? <img src={photo.thumbnailUrl||photo.storageUrl} alt={`写真 ${index+1}`} style={{ width:'100%', maxHeight:'85vw', objectFit:'contain', display:'block' }} />
                : <div style={{ height: 240, display:'flex', alignItems:'center', justifyContent:'center', color:'#CCC', fontSize:13, width:'100%' }}>読み込み中...</div>
              }
              {/* 手書きオーバーレイ */}
              {fb.drawingDataUrl && <img src={fb.drawingDataUrl} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', pointerEvents:'none' }} />}
              {/* 番号バッジ */}
              <div style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.55)', color:'#fff', borderRadius:8, padding:'3px 9px', fontSize:12, fontWeight:600 }}>
                {index+1}/{mainPhotos.length}
              </div>
              {/* 書き込みボタン */}
              <button onClick={() => setDrawingPhotoId(photo.id)}
                style={{ position:'absolute', bottom:12, right:12, padding:'7px 13px', borderRadius:16, background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:12, fontWeight:600, border:'none', cursor:'pointer', backdropFilter:'blur(4px)', ...font }}>
                ✏️ {fb.drawingDataUrl ? '書き直す' : '書き込む'}
              </button>
            </div>

            {/* OK / NG ボタン */}
            <div style={{ display:'flex', gap:10, padding:'14px 16px 12px' }}>
              <button onClick={() => updateFb(photo.id, 'status', 'ok')}
                style={{ flex:1, padding:'13px 0', borderRadius:28, border: isOk?'none':'1.5px solid #DDD', cursor:'pointer', fontSize:15, fontWeight:700, ...font,
                  background: isOk ? GRAD : 'transparent', color: isOk ? '#fff' : '#BDBDBD',
                }}>✓ OK</button>
              <button onClick={() => updateFb(photo.id, 'status', 'ng')}
                style={{ flex:1, padding:'13px 0', borderRadius:28, border: isNg?'none':'1.5px solid #DDD', cursor:'pointer', fontSize:15, fontWeight:700, ...font,
                  background: isNg ? '#E24B4A' : 'transparent', color: isNg ? '#fff' : '#BDBDBD',
                }}>✗ NG</button>
            </div>

            {/* 他の確認者のフィードバック */}
            {(() => {
              const others = prevRounds.filter(r => {
                const pf = r.photoFeedbacks?.[photo.id];
                return pf && (pf.status === 'ng' || pf.comment);
              });
              if (others.length === 0) return null;
              return (
                <div style={{ margin:'0 16px 14px', background:'#FAFAFA', borderRadius:12, padding:'10px 13px' }}>
                  <p style={{ fontSize:10, color:'#BBB', fontWeight:700, letterSpacing:'0.06em', margin:'0 0 6px' }}>ほかの確認者のフィードバック</p>
                  {others.map(r => {
                    const pf     = r.photoFeedbacks[photo.id];
                    const altIdx = pf.replaceWithPhotoId ? altPhotos.findIndex(a => a.id === pf.replaceWithPhotoId) : -1;
                    return (
                      <p key={r.id} style={{ fontSize:12, color:'#777', margin:'4px 0', lineHeight:1.7 }}>
                        <b style={{ color:'#555' }}>{r.reviewerName}さん：</b>
                        <span style={{ fontWeight:700, color: pf.status === 'ng' ? '#E24B4A' : '#00A651' }}>{pf.status === 'ng' ? 'NG' : 'OK'}</span>
                        {altIdx >= 0 && ` ／ 候補${String.fromCharCode(65 + altIdx)}に差し替え希望`}
                        {pf.drawingStorageUrl && ' ／ ✏️ 書き込みあり'}
                        {pf.comment && `　「${pf.comment}」`}
                      </p>
                    );
                  })}
                </div>
              );
            })()}

            {/* NG展開 */}
            {isNg && (
              <div style={{ padding:'0 16px 16px' }}>
                {/* コメント */}
                <textarea placeholder="どこをどう修正してほしいか教えてください（任意）" value={fb.comment} onChange={e => updateFb(photo.id, 'comment', e.target.value)} rows={3}
                  style={{ width:'100%', padding:'11px 13px', borderRadius:12, border:'1px solid #E8E8E8', fontSize:14, resize:'vertical', ...font, boxSizing:'border-box', color:'#333', background:'#FAFAFA' }} />

                {/* 差し替え候補 */}
                {altPhotos.length > 0 && (<>
                  <p style={{ fontSize:12, color:'#888', fontWeight:600, margin:'14px 0 10px' }}>差し替え候補（タップして選択）</p>
                  <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                    {altPhotos.map((alt, ai) => {
                      const sel = fb.replaceWithPhotoId === alt.id;
                      return (
                        <div key={alt.id} onClick={() => updateFb(photo.id, 'replaceWithPhotoId', sel ? null : alt.id)}
                          style={{ width:130, flexShrink:0, borderRadius:12, overflow:'hidden', cursor:'pointer',
                            border: sel ? '2.5px solid #833AB4' : '1.5px solid #E8E8E8' }}>
                          <div style={{ paddingBottom:'125%', position:'relative', background:'#E8E8E8' }}>
                            {(alt.thumbnailUrl||alt.storageUrl) && <img src={alt.thumbnailUrl||alt.storageUrl} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />}
                          </div>
                          <div style={{ padding:'7px 0', textAlign:'center', background: sel ? '#F5F0FA' : '#F7F7F7' }}>
                            <p style={{ fontSize:11, fontWeight:700, margin:0, color: sel ? '#833AB4' : '#888' }}>
                              {sel ? '✓ ' : ''}候補{String.fromCharCode(65+ai)}に差し替え
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => updateFb(photo.id, 'replaceWithPhotoId', null)}
                    style={{
                      width:'100%', padding:'12px 16px', borderRadius:12, cursor:'pointer',
                      border: fb.replaceWithPhotoId===null ? '1.5px solid #00A651' : '1.5px solid #E8E8E8',
                      background: fb.replaceWithPhotoId===null ? '#E6F9F0' : '#F7F7F7',
                      color: fb.replaceWithPhotoId===null ? '#00A651' : '#888',
                      fontSize:13, fontWeight:600, textAlign:'center', ...font,
                    }}>
                    {fb.replaceWithPhotoId===null ? '✓ ' : ''}差し替えなし（修正のみ依頼）
                  </button>
                </>)}
              </div>
            )}

            {/* 区切り */}
            <div style={{ height:1, background:'#F0F0F0' }} />
          </div>
        );
      })}

      {/* ─── キャプション・ハッシュタグ ─── */}
      <div style={{ padding:'20px 16px 0' }}>
        <p style={{ fontSize:11, color:'#AAA', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 10px' }}>キャプション・ハッシュタグ</p>
        <textarea value={captionEdit} onChange={e => setCaptionEdit(e.target.value)} rows={4} placeholder="キャプション"
          style={{ width:'100%', padding:'11px 13px', borderRadius:12, border:'1px solid #E8E8E8', fontSize:14, resize:'vertical', ...font, boxSizing:'border-box', color:'#333', background:'#FAFAFA', marginBottom:8 }} />
        <p style={{ fontSize:10, color: captionEdit.length>2200?'#E24B4A':'#CCC', textAlign:'right', margin:'0 0 10px' }}>{captionEdit.length}/2200</p>
        <textarea value={hashtagEdit} onChange={e => setHashtagEdit(e.target.value)} rows={2} placeholder="#ハッシュタグ"
          style={{ width:'100%', padding:'11px 13px', borderRadius:12, border:'1px solid #E8E8E8', fontSize:14, resize:'vertical', ...font, boxSizing:'border-box', color:'#833AB4', background:'#FAFAFA' }} />
      </div>

      {/* ─── 全体コメント ─── */}
      <div style={{ padding:'20px 16px 0' }}>
        <p style={{ fontSize:11, color:'#AAA', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 10px' }}>全体コメント（任意）</p>
        <textarea placeholder="全体的な感想や気になることがあれば" value={overallComment} onChange={e => setOverallComment(e.target.value)} rows={3}
          style={{ width:'100%', padding:'11px 13px', borderRadius:12, border:'1px solid #E8E8E8', fontSize:14, resize:'vertical', ...font, boxSizing:'border-box', color:'#333', background:'#FAFAFA' }} />
      </div>

      {/* ─── 送信ボタン ─── */}
      <div style={{ padding:'24px 16px 52px' }}>
        <button onClick={() => allJudged && setScreen('confirm')} disabled={!allJudged}
          style={{ width:'100%', padding:15, borderRadius:28, border:'none', cursor: allJudged?'pointer':'not-allowed',
            background: allJudged?GRAD:'#E8E8E8', color: allJudged?'#fff':'#BBB', fontSize:16, fontWeight:700, ...font }}>
          {allJudged ? '確認完了・送信へ →' : `残り ${mainPhotos.length-okCount-ngCount}枚を確認してください`}
        </button>
      </div>
    </div>
  );
}
