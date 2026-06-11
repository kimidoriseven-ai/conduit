import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../firebase/config';
import usePageTitle from '../../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';
// 管理者のFirebase Auth UID（アクセス制御の本体はFirestore/Storageルール側。ここはUX用の早期チェック）
const ADMIN_UID = 'UMQBgF0qSogFaabzjHUuslmyuQ53';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.167.282-1.707V4.961H.957A9 9 0 0 0 0 9c0 1.452.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  usePageTitle('ログイン');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user.uid !== ADMIN_UID) {
        await auth.signOut();
        setError('このアカウントにはアクセス権限がありません。');
        return;
      }
      navigate('/admin');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('ログインに失敗しました。再度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F5F5F5',
      fontFamily: '-apple-system, "Hiragino Sans", sans-serif',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* ブランド */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            height: 4, width: 48, borderRadius: 2,
            background: GRAD,
            margin: '0 auto 20px',
          }} />
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: '#1a1a1a',
            margin: '0 0 6px', letterSpacing: '-0.3px',
          }}>Conduit</h1>
          <p style={{ fontSize: 13, color: '#BBB', margin: 0 }}>Instagram 投稿管理</p>
        </div>

        {/* カード */}
        <div style={{
          background: '#fff',
          borderRadius: 18,
          border: '0.5px solid #E8E8E8',
          padding: '28px 24px',
        }}>
          <p style={{
            fontSize: 11, color: '#BBB', textAlign: 'center',
            margin: '0 0 18px', fontWeight: 700, letterSpacing: '0.08em',
          }}>
            管理者ログイン
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: '#fff',
              border: '0.5px solid #E8E8E8',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: loading ? '#CCC' : '#333',
              fontFamily: 'inherit',
            }}
          >
            {!loading && <GoogleIcon />}
            {loading ? 'ログイン中...' : 'Google でログイン'}
          </button>

          {error && (
            <div style={{
              background: '#FFEBEB',
              color: '#E24B4A',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12,
              marginTop: 14,
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
