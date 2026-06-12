import { useState, useEffect } from 'react';
import { collection, addDoc, doc, setDoc, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import { toast } from '../../components/Toast';
import usePageTitle from '../../hooks/usePageTitle';
import { uploadPhoto } from '../../utils/image';

const uuidv4 = () => crypto.randomUUID();
const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';
const DEFAULT_MAIN = 6;
const DEFAULT_ALT  = 2;

const STEPS = ['写真', 'キャプション', '日時・URL'];

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0 4px', margin: '14px 0 18px' }}>
      {STEPS.map((label, i) => {
        const done   = i < current - 1;
        const active = i === current - 1;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: i < STEPS.length - 1 ? '1 0 auto' : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: done ? GRAD : active ? '#833AB4' : '#E8E8E8',
                color: done || active ? '#fff' : '#AAA',
              }}>{done ? '✓' : i + 1}</div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#833AB4' : '#AAA', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? GRAD : '#E8E8E8', margin: '12px 4px 0', minWidth: 12 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// 写真スロット
function PhotoSlot({ index, preview, onChange }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      border: preview ? '0.5px solid #E8E8E8' : '1.5px dashed #CCC',
      borderRadius: 12, aspectRatio: '4/5', cursor: 'pointer',
      overflow: 'hidden', position: 'relative', background: preview ? '#F0F0F0' : '#FAFAFA',
    }}>
      {preview
        ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: 0 }} />
        : <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <span style={{ fontSize: 10, color: '#CCC', fontWeight: 700, marginTop: 4 }}>{index + 1}</span>
          </>
      }
      <input type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onChange(e.target.files[0])} />
    </label>
  );
}

export default function ProjectCreatePage() {
  usePageTitle('新しい案件');
  const [step, setStep] = useState(1);

  const [projectTitle, setProjectTitle] = useState('');
  const [mainPhotoCount, setMainCount]  = useState(DEFAULT_MAIN);
  const [altPhotoCount, setAltCount]    = useState(DEFAULT_ALT);

  // 写真ファイル: { file: File, preview: string }[] — インデックスで管理
  const [mainPhotos, setMainPhotos] = useState(Array(DEFAULT_MAIN).fill(null));
  const [altPhotos, setAltPhotos]   = useState(Array(DEFAULT_ALT).fill(null));

  const [caption, setCaption]           = useState('');
  const [hashtags, setHashtags]         = useState('');
  const [scheduledDatetime, setScheduledDatetime] = useState(defaultScheduledValue);
  const [confirmDeadline, setConfirmDeadline]     = useState(defaultDeadlineValue);
  const [saving, setSaving]             = useState(false);
  const [confirmUrl, setConfirmUrl]     = useState('');
  const [copied, setCopied]             = useState(false);
  const [igAccounts, setIgAccounts]     = useState([]); // { id, username }[]
  const [selectedIgAccountId, setSelectedIgAccountId] = useState('');

  // 2日後をdate形式（YYYY-MM-DD）で返す
  function defaultDeadlineValue() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // 3日後18:00をdatetime-local形式（YYYY-MM-DDTHH:MM）で返す
  function defaultScheduledValue() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(18, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
  }

  useEffect(() => {
    getDocs(collection(db, 'instagramAccounts'))
      .then(snap => {
        const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIgAccounts(accounts);
        if (accounts.length > 0) setSelectedIgAccountId(accounts[0].id);
      })
      .catch(() => {});
  }, []);

  // 枚数変更：既存の写真を保持しつつ配列サイズを変更
  function handleMainCountChange(n) {
    setMainCount(n);
    setMainPhotos(prev => {
      const next = Array(n).fill(null);
      prev.forEach((p, i) => { if (i < n) next[i] = p; });
      return next;
    });
  }
  function handleAltCountChange(n) {
    setAltCount(n);
    setAltPhotos(prev => {
      const next = Array(n).fill(null);
      prev.forEach((p, i) => { if (i < n) next[i] = p; });
      return next;
    });
  }

  // 写真をスロットにセット
  function setMainPhoto(i, file) {
    setMainPhotos(prev => {
      const a = [...prev];
      a[i] = { file, preview: URL.createObjectURL(file) };
      return a;
    });
  }
  function setAltPhoto(i, file) {
    setAltPhotos(prev => {
      const a = [...prev];
      a[i] = { file, preview: URL.createObjectURL(file) };
      return a;
    });
  }

  // 並び替え：index と方向（-1=左, +1=右）でスワップ
  function moveMainPhoto(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= mainPhotoCount) return;
    setMainPhotos(prev => {
      const a = [...prev];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }
  function moveAltPhoto(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= altPhotoCount) return;
    setAltPhotos(prev => {
      const a = [...prev];
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  }

  // 複数ファイル一括追加（空きスロットを埋め、足りなければ拡張）
  function handleBulkSelect(files, type) {
    const entries = Array.from(files).map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    if (type === 'main') {
      setMainPhotos(prev => {
        const next = [...prev];
        let ei = 0;
        for (const entry of entries) {
          const emptyIdx = next.findIndex(p => p === null);
          if (emptyIdx !== -1) { next[emptyIdx] = entry; }
          else { next.push(entry); }
        }
        setMainCount(next.length);
        return next;
      });
    } else {
      setAltPhotos(prev => {
        const next = [...prev];
        for (const entry of entries) {
          const emptyIdx = next.findIndex(p => p === null);
          if (emptyIdx !== -1) { next[emptyIdx] = entry; }
          else { next.push(entry); }
        }
        setAltCount(next.length);
        return next;
      });
    }
  }

  const step1Ok = mainPhotos.some(p => p !== null);

  async function handleGenerate() {
    setSaving(true);
    try {
      const token = uuidv4();
      const expires = (() => {
        const d = confirmDeadline ? new Date(confirmDeadline) : new Date();
        if (!confirmDeadline) d.setDate(d.getDate() + 7);
        d.setHours(23, 59, 59, 0);
        return d;
      })();
      const scheduledAt = Timestamp.fromDate(
        scheduledDatetime ? new Date(scheduledDatetime) : (() => {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d;
        })()
      );

      const actualMainCount = mainPhotos.filter(Boolean).length;
      const actualAltCount  = altPhotos.filter(Boolean).length;

      const projectRef = await addDoc(collection(db, 'projects'), {
        projectTitle: projectTitle || '',
        status: 'waiting_review',
        confirmToken: token,
        confirmTokenExpiresAt: Timestamp.fromDate(expires),
        mainPhotoCount: actualMainCount,
        alternativePhotoCount: actualAltCount,
        caption, hashtags,
        defaultScheduledAt: scheduledAt,
        currentRound: 1, approvedCount: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        lastFeedbackAt: null, allApprovedAt: null,
        ...(igAccounts.length >= 2
          ? { instagramAccountId: selectedIgAccountId }
          : igAccounts.length === 1
            ? { instagramAccountId: igAccounts[0].id }
            : {}),
      });

      // 確認URL用のトークン→projectId ルックアップ（未認証クライアントは projects を list できないため）
      await setDoc(doc(db, 'confirmLinks', token), {
        projectId: projectRef.id,
        expiresAt: Timestamp.fromDate(expires),
        createdAt: serverTimestamp(),
      });

      for (let i = 0; i < mainPhotoCount; i++) {
        const photo = mainPhotos[i];
        if (!photo) continue;
        const { storageUrl, thumbnailUrl } = await uploadPhoto(projectRef.id, photo.file);
        await addDoc(collection(db, 'projects', projectRef.id, 'photos'), {
          type: 'main', order: i, storageUrl, thumbnailUrl,
          linkedAlternativeIds: [], linkedMainPhotoId: null, scheduledAt,
          isActiveForPost: true, replacedByPhotoId: null,
          currentStatus: 'pending', latestRound: 1, instagramStatus: 'pending',
          instagramMediaId: null, instagramPostUrl: null, instagramPostedAt: null, instagramError: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }
      for (let i = 0; i < altPhotoCount; i++) {
        const photo = altPhotos[i];
        if (!photo) continue;
        const { storageUrl, thumbnailUrl } = await uploadPhoto(projectRef.id, photo.file);
        await addDoc(collection(db, 'projects', projectRef.id, 'photos'), {
          type: 'alternative', order: i, storageUrl, thumbnailUrl,
          linkedAlternativeIds: [], linkedMainPhotoId: null, scheduledAt,
          isActiveForPost: false, replacedByPhotoId: null,
          currentStatus: 'pending', latestRound: 1, instagramStatus: 'pending',
          instagramMediaId: null, instagramPostUrl: null, instagramPostedAt: null, instagramError: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      }

      setConfirmUrl(`${window.location.origin}/confirm/${token}`);
    } catch (e) {
      console.error(e);
      toast('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(confirmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function shareLine() {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(`投稿写真のご確認をお願いします🙏\n${confirmUrl}`)}`);
  }

  const hdr = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8',
    background: '#fff', position: 'sticky', top: 0, zIndex: 10,
  };
  const card = {
    background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8',
    padding: '14px 16px', marginBottom: 14,
  };
  const lbl = {
    display: 'block', fontSize: 11, color: '#AAA',
    fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6,
  };
  const inp = {
    width: '100%', border: '0.5px solid #DDD', borderRadius: 12,
    padding: '10px 12px', fontSize: 15, fontFamily: 'inherit',
    background: '#fff', boxSizing: 'border-box',
  };

  // 写真グリッド（並び替えボタン付き）
  function PhotoGrid({ photos, count, onSet, onMove, onBulk }) {
    return (<>
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '9px 0', borderRadius: 12, border: '1px dashed #C8A0E8',
        background: '#FAF4FF', color: '#833AB4', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', marginBottom: 10,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#833AB4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        複数まとめて選択
        <input type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) { onBulk(e.target.files); e.target.value = ''; } }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {Array.from({ length: count }, (_, i) => {
          const p = photos[i];
          return (
            <div key={i} style={{ position: 'relative' }}>
              <PhotoSlot index={i} preview={p?.preview || null} onChange={file => onSet(i, file)} />
              {p && (
                <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
                  <button onClick={() => onMove(i, -1)} disabled={i === 0}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: i === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.45)',
                      color: '#fff', fontSize: 11, cursor: i === 0 ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>‹</button>
                  <span style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 5px', lineHeight: '18px' }}>{i + 1}</span>
                  <button onClick={() => onMove(i, 1)} disabled={i === count - 1}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: i === count - 1 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.45)',
                      color: '#fff', fontSize: 11, cursor: i === count - 1 ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>›</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>);
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', background: '#F5F5F5', minHeight: '100vh', fontFamily: '-apple-system, "Hiragino Sans", sans-serif' }}>

      {/* ===== STEP 1 ===== */}
      {step === 1 && (<>
        <div style={hdr}>
          <Link to="/admin" style={{ fontSize: 26, color: '#999', textDecoration: 'none', lineHeight: 1, padding: '2px 8px 2px 0' }}>✕</Link>
          <span style={{ fontSize: 15, fontWeight: 600 }}>新しい案件</span>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ padding: '0 14px 32px' }}>
          <StepBar current={1} />

          {/* 案件名（任意） */}
          <div style={card}>
            <label style={lbl}>案件名（任意）</label>
            <input type="text" value={projectTitle} onChange={e => setProjectTitle(e.target.value)}
              placeholder="例：5月18日の集会" style={inp} />
          </div>

          {/* 枚数設定 */}
          <div style={{ ...card, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>投稿予定枚数</label>
              <select value={mainPhotoCount} onChange={e => handleMainCountChange(Number(e.target.value))} style={inp}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}枚</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>差し替え候補</label>
              <select value={altPhotoCount} onChange={e => handleAltCountChange(Number(e.target.value))} style={inp}>
                {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}枚</option>)}
              </select>
            </div>
          </div>

          {/* 投稿予定写真 */}
          <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8 }}>
            投稿予定写真（{mainPhotoCount}枚）
          </p>
          <PhotoGrid photos={mainPhotos} count={mainPhotoCount} onSet={setMainPhoto} onMove={moveMainPhoto}
            onBulk={files => handleBulkSelect(files, 'main')} />

          {/* 差し替え候補 */}
          {altPhotoCount > 0 && <>
            <p style={{ fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 8 }}>
              差し替え候補（{altPhotoCount}枚）
            </p>
            <PhotoGrid photos={altPhotos} count={altPhotoCount} onSet={setAltPhoto} onMove={moveAltPhoto}
              onBulk={files => handleBulkSelect(files, 'alt')} />
          </>}

          <button onClick={() => setStep(2)} disabled={!step1Ok}
            style={{ width: '100%', padding: 15, borderRadius: 28, border: 'none', fontSize: 15, fontWeight: 600,
              cursor: step1Ok ? 'pointer' : 'not-allowed',
              background: step1Ok ? GRAD : '#E0E0E0', color: step1Ok ? '#fff' : '#AAA', fontFamily: 'inherit' }}>
            次へ：キャプション入力 →
          </button>
        </div>
      </>)}

      {/* ===== STEP 2 ===== */}
      {step === 2 && (<>
        <div style={hdr}>
          <span onClick={() => setStep(1)} style={{ fontSize: 28, color: '#999', cursor: 'pointer', lineHeight: 1, padding: '2px 8px 2px 0' }}>‹</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>新しい案件</span>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ padding: '0 14px 32px' }}>
          <StepBar current={2} />
          <div style={card}>
            <label style={lbl}>キャプション</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5}
              placeholder="投稿に使うキャプションを入力してください"
              style={{ ...inp, resize: 'none' }} />
            <p style={{ fontSize: 10, color: caption.length > 2200 ? '#E24B4A' : '#CCC', textAlign: 'right', marginTop: 4 }}>{caption.length} / 2200文字</p>
          </div>
          <div style={{ ...card, marginBottom: 24 }}>
            <label style={lbl}>ハッシュタグ</label>
            <textarea value={hashtags} onChange={e => setHashtags(e.target.value)} rows={3}
              placeholder="#ハッシュタグ #ハッシュタグ"
              style={{ ...inp, resize: 'none', color: '#833AB4' }} />
            <p style={{ fontSize: 10, color: '#CCC', textAlign: 'right', marginTop: 4 }}>
              {hashtags.split(/\s+/).filter(t => t.startsWith('#')).length} / 30個
            </p>
          </div>
          <button onClick={() => setStep(3)} style={{ width: '100%', padding: 15, borderRadius: 28, border: 'none', background: GRAD, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
            次へ：投稿日時・URL発行 →
          </button>
          <button onClick={() => setStep(1)} style={{ width: '100%', padding: 13, borderRadius: 28, border: '1px solid #DDD', background: '#fff', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            戻る
          </button>
        </div>
      </>)}

      {/* ===== STEP 3 ===== */}
      {step === 3 && (<>
        <div style={hdr}>
          <span onClick={() => setStep(2)} style={{ fontSize: 28, color: '#999', cursor: 'pointer', lineHeight: 1, padding: '2px 8px 2px 0' }}>‹</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>新しい案件</span>
          <div style={{ width: 40 }} />
        </div>
        <div style={{ padding: '0 14px 32px' }}>
          <StepBar current={3} />
          {igAccounts.length >= 2 && (
            <div style={card}>
              <label style={lbl}>投稿先Instagramアカウント</label>
              <select
                value={selectedIgAccountId}
                onChange={e => setSelectedIgAccountId(e.target.value)}
                style={inp}>
                {igAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>@{acc.username}</option>
                ))}
              </select>
            </div>
          )}

          <div style={card}>
            <label style={lbl}>投稿予定日時</label>
            <input type="datetime-local" value={scheduledDatetime} onChange={e => setScheduledDatetime(e.target.value)} style={inp} />
          </div>

          <div style={card}>
            <label style={lbl}>確認期限</label>
            <input type="date" value={confirmDeadline} onChange={e => setConfirmDeadline(e.target.value)}
              disabled={!!confirmUrl}
              style={{ ...inp, color: confirmUrl ? '#AAA' : '#333' }} />
            <p style={{ fontSize: 11, color: '#BBB', marginTop: 6, lineHeight: 1.5 }}>
              この日を過ぎると確認URLが無効になります
            </p>
          </div>

          {confirmUrl ? (<>
            <div style={card}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: GRAD, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>確認URLを発行しました</p>
                  <p style={{ fontSize: 11, color: '#AAA' }}>確認期限：{confirmDeadline ? new Date(confirmDeadline).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' }) : ''}まで</p>
                </div>
              </div>
              <label style={lbl}>クライアント確認URL</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" readOnly value={confirmUrl} style={{ ...inp, fontSize: 12, color: '#555', background: '#F5F5F5', flex: 1 }} />
                <button onClick={copyUrl} style={{ flexShrink: 0, padding: '10px 14px', borderRadius: 12, border: 'none', background: GRAD, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {copied ? '✓' : 'コピー'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <button onClick={shareLine} style={{ flex: 1, padding: 12, borderRadius: 20, border: '0.5px solid #E8E8E8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#1a1a1a' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06C755" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                LINEで送る
              </button>
              <button onClick={copyUrl} style={{ flex: 1, padding: 12, borderRadius: 20, border: '0.5px solid #E8E8E8', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#1a1a1a' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                URLをコピー
              </button>
            </div>
            <Link to="/admin" style={{ textDecoration: 'none' }}>
              <button style={{ width: '100%', padding: 15, borderRadius: 28, border: 'none', background: GRAD, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ダッシュボードへ
              </button>
            </Link>
          </>) : (
            <button onClick={handleGenerate} disabled={saving}
              style={{ width: '100%', padding: 15, borderRadius: 28, border: 'none', background: saving ? '#E0E0E0' : GRAD, color: saving ? '#AAA' : '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'アップロード中...' : 'URLを発行する'}
            </button>
          )}
        </div>
      </>)}
    </div>
  );
}
