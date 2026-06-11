import { useState, useEffect } from 'react';

// シンプルなトースト通知（alert() の置き換え）
// 使い方: import { toast } from '../components/Toast'; toast('保存に失敗しました');
let listener = null;

export function toast(message, type = 'error') {
  if (listener) listener({ message, type, id: Date.now() });
}

export function Toaster() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    listener = setItem;
    return () => { listener = null; };
  }, []);

  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setItem(null), 3500);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;
  return (
    <div
      key={item.id}
      onClick={() => setItem(null)}
      style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, maxWidth: '90vw', cursor: 'pointer',
        background: item.type === 'error' ? '#E24B4A' : '#1a1a1a', color: '#fff',
        padding: '12px 22px', borderRadius: 24, fontSize: 13, fontWeight: 600,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        fontFamily: '-apple-system, "Hiragino Sans", sans-serif',
      }}
    >
      {item.message}
    </div>
  );
}
