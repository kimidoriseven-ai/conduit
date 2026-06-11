import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../../firebase/config';
import usePageTitle from '../../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

export default function SettingsPage() {
  usePageTitle('システム設定');
  const [lineToken,   setLineToken]   = useState('');
  const [lineSaving,  setLineSaving]  = useState(false);
  const [lineSaved,   setLineSaved]   = useState(false);
  const [lineError,   setLineError]   = useState('');
  const [savedAt,     setSavedAt]     = useState(null);
  const [hasSaved,    setHasSaved]    = useState(false);

  // Instagram設定
  const [igAccountId,  setIgAccountId]  = useState('');
  const [igToken,      setIgToken]      = useState('');
  const [igSaving,     setIgSaving]     = useState(false);
  const [igSaved,      setIgSaved]      = useState(false);
  const [igError,      setIgError]      = useState('');
  const [igStatus,     setIgStatus]     = useState(null); // { savedAt, expiresAt }

  const font = { fontFamily: '-apple-system, "Hiragino Sans", sans-serif' };
  const card = { background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '18px 16px', marginBottom: 14 };
  const lbl  = { display: 'block', fontSize: 11, color: '#AAA', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 };
  const inp  = { width: '100%', border: '0.5px solid #E8E8E8', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#333', background: '#F7F7F7', fontFamily: 'inherit', boxSizing: 'border-box' };

  useEffect(() => {
    async function loadStatus() {
      try {
        const [lineSnap, igSnap] = await Promise.all([
          getDoc(doc(db, 'systemConfig', 'lineNotify')),
          getDoc(doc(db, 'systemConfig', 'instagram')),
        ]);
        if (lineSnap.exists() && lineSnap.data().accessToken) {
          setHasSaved(true);
          const updatedAt = lineSnap.data().updatedAt?.toDate();
          if (updatedAt) setSavedAt(updatedAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }));
        }
        if (igSnap.exists() && igSnap.data().accessToken) {
          const d = igSnap.data();
          const expiresAt = d.tokenExpiresAt?.toDate?.();
          setIgStatus({
            savedAt:   d.updatedAt?.toDate?.()?.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
            expiresAt: expiresAt?.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
            accountId: d.accountId,
          });
        }
      } catch {}
    }
    loadStatus();
  }, []);

  async function saveIgSettings() {
    if (!igAccountId.trim() || !igToken.trim()) return;
    setIgSaving(true);
    setIgError('');
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);
      await setDoc(doc(db, 'systemConfig', 'instagram'), {
        accountId:      igAccountId.trim(),
        accessToken:    igToken.trim(),
        tokenExpiresAt: Timestamp.fromDate(expiresAt),
        updatedAt:      serverTimestamp(),
      }, { merge: true });
      setIgStatus({
        savedAt:   new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
        expiresAt: expiresAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
        accountId: igAccountId.trim(),
      });
      setIgSaved(true);
      setIgToken('');
      setIgAccountId('');
      setTimeout(() => setIgSaved(false), 3000);
    } catch (e) {
      setIgError('保存に失敗しました。' + e.message);
    } finally {
      setIgSaving(false);
    }
  }

  async function saveLineToken() {
    if (!lineToken.trim()) return;
    setLineSaving(true);
    setLineError('');
    try {
      await setDoc(doc(db, 'systemConfig', 'lineNotify'), {
        accessToken: lineToken.trim(),
        updatedAt:   serverTimestamp(),
      }, { merge: true });
      setHasSaved(true);
      setLineSaved(true);
      setLineToken('');
      setSavedAt(new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }));
      setTimeout(() => setLineSaved(false), 3000);
    } catch (e) {
      setLineError('保存に失敗しました。' + e.message);
    } finally {
      setLineSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', background: '#F5F5F5', minHeight: '100vh', ...font }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/admin" style={{ fontSize: 26, color: '#999', textDecoration: 'none', lineHeight: 1, padding: '2px 8px 2px 0' }}>‹</Link>
        <span style={{ fontSize: 15, fontWeight: 600 }}>システム設定</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '14px 14px 48px' }}>

        {/* LINE 通知設定 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>LINE 通知設定</p>
              <p style={{ fontSize: 11, color: '#AAA', margin: 0 }}>LINE Messaging API チャンネルアクセストークン</p>
            </div>
          </div>

          {/* 保存済みステータス */}
          {hasSaved && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#E6F9F0', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              <span style={{ fontSize: 16, color: '#00A651' }}>✓</span>
              <div>
                <p style={{ fontSize: 12, color: '#00A651', fontWeight: 700, margin: 0 }}>トークン保存済み</p>
                {savedAt && <p style={{ fontSize: 11, color: '#AAA', margin: 0 }}>最終更新：{savedAt}</p>}
              </div>
            </div>
          )}

          <label style={lbl}>{hasSaved ? 'トークンを更新する場合' : 'チャンネルアクセストークン'}</label>
          <input
            type="password"
            placeholder="チャンネルアクセストークンを貼り付け"
            value={lineToken}
            onChange={e => setLineToken(e.target.value)}
            style={{ ...inp, marginBottom: 8 }}
          />
          <p style={{ fontSize: 11, color: '#AAA', margin: '0 0 12px', lineHeight: 1.6 }}>
            LINE Developers Console → チャンネル → Messaging API → チャンネルアクセストークン
          </p>

          {lineError && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{lineError}</p>}

          {lineSaved && (
            <div style={{ background: '#E6F9F0', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: '#00A651', fontWeight: 600, margin: 0 }}>✓ LINE トークンを保存しました</p>
            </div>
          )}

          <button
            onClick={saveLineToken}
            disabled={lineSaving || !lineToken.trim()}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 20, border: 'none',
              cursor: (lineSaving || !lineToken.trim()) ? 'not-allowed' : 'pointer',
              background: (lineSaving || !lineToken.trim()) ? '#E0E0E0' : '#06C755',
              color: (lineSaving || !lineToken.trim()) ? '#AAA' : '#fff',
              fontSize: 13, fontWeight: 600, ...font,
            }}>
            {lineSaving ? '保存中...' : hasSaved ? 'トークンを更新する' : 'トークンを保存する'}
          </button>
        </div>

        {/* Instagram設定 */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Instagram 設定</p>
              <p style={{ fontSize: 11, color: '#AAA', margin: 0 }}>自動投稿に使用するアカウント（共通設定）</p>
            </div>
          </div>

          {igStatus && (
            <div style={{ background: '#E6F9F0', borderRadius: 10, padding: '9px 12px', marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: '#00A651', fontWeight: 700, margin: '0 0 2px' }}>✓ 設定済み（ID: {igStatus.accountId}）</p>
              {igStatus.expiresAt && <p style={{ fontSize: 11, color: '#AAA', margin: 0 }}>トークン期限：{igStatus.expiresAt}　最終更新：{igStatus.savedAt}</p>}
            </div>
          )}

          <label style={{ ...lbl, marginBottom: 4 }}>{igStatus ? 'アカウントIDを変更する場合' : 'アカウントID（数字）'}</label>
          <input type="text" placeholder="例：17841400000000000" value={igAccountId}
            onChange={e => setIgAccountId(e.target.value)}
            style={{ ...inp, marginBottom: 10 }} />
          <label style={{ ...lbl, marginBottom: 4 }}>{igStatus ? 'アクセストークンを更新する場合' : 'アクセストークン'}</label>
          <input type="password" placeholder="EAA..." value={igToken}
            onChange={e => setIgToken(e.target.value)}
            style={{ ...inp, marginBottom: 6 }} />
          <p style={{ fontSize: 11, color: '#AAA', margin: '0 0 12px', lineHeight: 1.6 }}>
            Meta開発者ダッシュボード → Instagramログインによる設定 → アクセストークンを生成<br/>
            ※ トークン有効期限は60日。期限5日前に自動更新されます。
          </p>

          {igError && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{igError}</p>}
          {igSaved && <div style={{ background: '#E6F9F0', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}><p style={{ fontSize: 13, color: '#00A651', fontWeight: 600, margin: 0 }}>✓ Instagram設定を保存しました</p></div>}

          <button onClick={saveIgSettings}
            disabled={igSaving || !igAccountId.trim() || !igToken.trim()}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 20, border: 'none',
              cursor: (igSaving || !igAccountId.trim() || !igToken.trim()) ? 'not-allowed' : 'pointer',
              background: (igSaving || !igAccountId.trim() || !igToken.trim()) ? '#E0E0E0' : GRAD,
              color: (igSaving || !igAccountId.trim() || !igToken.trim()) ? '#AAA' : '#fff',
              fontSize: 13, fontWeight: 600, ...font,
            }}>
            {igSaving ? '保存中...' : igStatus ? '設定を更新する' : '設定を保存する'}
          </button>
        </div>

        {/* 使い方ガイド */}
        <div style={{ background: '#F0F4FF', borderRadius: 16, padding: '14px 16px', border: '0.5px solid #C7D7F7' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#0055BB', marginBottom: 8 }}>通知が届く条件</p>
          <ul style={{ fontSize: 12, color: '#555', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
            <li>クライアントがフィードバックを送信したとき</li>
            <li>全写真が承認されたとき（投稿予約確定）</li>
            <li>Instagram自動投稿が完了・失敗したとき</li>
            <li>Instagramトークンの期限が5日以内になったとき</li>
          </ul>
          <p style={{ fontSize: 11, color: '#888', marginTop: 10, marginBottom: 0 }}>
            ※ LINE Official Account に自分がフレンド登録されている必要があります
          </p>
        </div>

      </div>
    </div>
  );
}
