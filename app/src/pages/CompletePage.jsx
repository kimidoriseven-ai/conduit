import { useParams, Link } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

export default function CompletePage() {
  usePageTitle('送信完了');
  const { token } = useParams();

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
        ✓
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.4 }}>
        ありがとうございます！
      </h1>
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 1.8, margin: '0 0 32px' }}>
        フィードバックを送信しました😊<br />
        担当者が確認次第ご連絡いたします。
      </p>

      <div style={{ width: '100%', background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '16px 20px', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: '#666', textAlign: 'center', margin: 0, lineHeight: 1.7 }}>
          このページは閉じていただいて構いません。
        </p>
      </div>

      {/* 送信内容・他の方の確認状況をもう一度見られる導線 */}
      <Link to={`/confirm/${token}`} style={{ textDecoration: 'none', width: '100%' }}>
        <button style={{
          width: '100%', padding: 13, borderRadius: 28, border: '1px solid #E0E0E0',
          background: '#fff', color: '#888', fontSize: 14, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          確認ページをもう一度ひらく
        </button>
      </Link>
    </div>
  );
}
