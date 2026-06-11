import usePageTitle from '../hooks/usePageTitle';

export default function InvalidTokenPage() {
  usePageTitle('無効なURL');
  return (
    <div style={{
      maxWidth: 480, margin: '0 auto', minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', background: '#F5F5F5',
      fontFamily: '-apple-system, "Hiragino Sans", sans-serif',
    }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>🔗</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' }}>
        このURLは無効です
      </h1>
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 1.8, margin: '0 0 28px' }}>
        URLの有効期限が切れているか、<br />
        リンクが正しくない可能性があります。
      </p>
      <div style={{ width: '100%', background: '#fff', borderRadius: 18, border: '0.5px solid #E8E8E8', padding: '16px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.7 }}>
          担当者から届いたLINEのリンクを<br />再度タップするか、担当者にご連絡ください。
        </p>
      </div>
    </div>
  );
}
