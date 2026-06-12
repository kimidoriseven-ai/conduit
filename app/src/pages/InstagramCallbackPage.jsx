import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import usePageTitle from '../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

export default function InstagramCallbackPage() {
  usePageTitle('Instagram連携');

  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [username, setUsername] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDesc = params.get('error_description');

    if (error) {
      const msg = errorDesc
        ? `${errorDesc}（キャンセルされた可能性があります）`
        : 'キャンセルされた可能性があります。';
      setErrorMessage(msg);
      setStatus('error');
      return;
    }

    if (!code || !state) {
      setErrorMessage('無効なリンクです。担当者に再発行をご依頼ください。');
      setStatus('error');
      return;
    }

    const completeInstagramOAuth = httpsCallable(functions, 'completeInstagramOAuth');
    completeInstagramOAuth({ code, state })
      .then(result => {
        setUsername(result.data.username);
        setStatus('success');
      })
      .catch(e => {
        setErrorMessage(e.message || '連携処理に失敗しました。');
        setStatus('error');
      });
  }, []);

  return (
    <div style={{
      maxWidth: 480, margin: '0 auto', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', background: '#F5F5F5',
      fontFamily: '-apple-system, "Hiragino Sans", sans-serif',
    }}>
      {/* アイコン */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%', background: GRAD,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36, marginBottom: 24, boxShadow: '0 4px 20px rgba(131,58,180,0.3)',
        color: '#fff',
      }}>
        {status === 'loading' && (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/>
          </svg>
        )}
        {status === 'success' && '✓'}
        {status === 'error' && '✕'}
      </div>

      {status === 'loading' && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.4 }}>
            連携処理中...
          </h1>
          <p style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 1.8, margin: '0 0 32px' }}>
            連携処理中です…そのままお待ちください
          </p>
        </>
      )}

      {status === 'success' && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.4 }}>
            連携完了🎉
          </h1>
          <p style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 1.8, margin: '0 0 32px' }}>
            @{username} と連携しました🎉
          </p>
          <div style={{ width: '100%', background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '16px 20px' }}>
            <p style={{ fontSize: 13, color: '#666', textAlign: 'center', margin: 0, lineHeight: 1.7 }}>
              このページは閉じて構いません。<br />
              担当者に連携完了をお知らせください。
            </p>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.4 }}>
            連携に失敗しました
          </h1>
          <p style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 1.8, margin: '0 0 32px' }}>
            {errorMessage}
          </p>
          <div style={{ width: '100%', background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '16px 20px' }}>
            <p style={{ fontSize: 13, color: '#666', textAlign: 'center', margin: 0, lineHeight: 1.7 }}>
              リンクの有効期限が切れている可能性があります。<br />
              担当者に再発行をご依頼ください。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
