import { useEffect } from 'react';

// ページごとにブラウザタブのタイトルを設定する
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Conduit` : 'Conduit — Instagram投稿確認';
  }, [title]);
}
