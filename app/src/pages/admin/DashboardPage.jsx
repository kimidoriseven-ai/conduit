import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query, deleteDoc, doc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import { db, auth, storage } from '../../firebase/config';
import { toast } from '../../components/Toast';
import usePageTitle from '../../hooks/usePageTitle';

const GRAD = 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)';

const STATUS_LABELS = {
  draft:             { label: '下書き',           badge: 'b-rev' },
  waiting_review:    { label: '確認待ち',          badge: 'b-wait' },
  feedback_received: { label: 'フィードバック受信', badge: 'b-fb' },
  in_revision:       { label: '修正対応中',        badge: 'b-rev' },
  all_approved:      { label: '投稿予約中',        badge: 'b-done' },
  posting:           { label: '投稿中',            badge: 'b-done' },
  completed:         { label: '投稿完了',          badge: 'b-ok' },
  error:             { label: 'エラー',            badge: 'b-ng' },
};

const BADGE_STYLES = {
  'b-wait': { background: '#FFF3CD', color: '#856404' },
  'b-fb':   { background: '#FFEBEB', color: '#E24B4A' },
  'b-rev':  { background: '#E8F4FD', color: '#0055BB' },
  'b-done': { background: '#E6F9F0', color: '#00A651' },
  'b-ok':   { background: '#E6F9F0', color: '#00A651' },
  'b-ng':   { background: '#FFEBEB', color: '#E24B4A' },
};

export default function DashboardPage() {
  usePageTitle('案件一覧');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleLogout() {
    await signOut(auth);
    navigate('/admin/login');
  }

  async function handleDelete(projectId) {
    setDeleteLoading(true);
    try {
      // Storage上のファイルをフォルダごと削除（写真・手書き書き込み・サムネイル）
      for (const folder of ['photos', 'drawings', 'thumbnails']) {
        try {
          const res = await listAll(ref(storage, `projects/${projectId}/${folder}`));
          await Promise.all(res.items.map(item => deleteObject(item).catch(() => {})));
        } catch {}
      }
      // 写真ドキュメントを削除
      const photosSnap = await getDocs(collection(db, 'projects', projectId, 'photos'));
      for (const photoDoc of photosSnap.docs) await deleteDoc(photoDoc.ref);
      // feedbackRoundsを削除
      const roundsSnap = await getDocs(collection(db, 'projects', projectId, 'feedbackRounds'));
      for (const roundDoc of roundsSnap.docs) await deleteDoc(roundDoc.ref);
      // 確認URLのルックアップを削除
      const proj = projects.find(p => p.id === projectId);
      if (proj?.confirmToken) {
        try { await deleteDoc(doc(db, 'confirmLinks', proj.confirmToken)); } catch {}
      }
      // プロジェクト本体を削除
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setConfirmDeleteId(null);
    } catch (e) {
      console.error(e);
      toast('削除に失敗しました。');
    } finally {
      setDeleteLoading(false);
    }
  }

  const stats = {
    waiting:  projects.filter(p => p.status === 'waiting_review').length,
    feedback: projects.filter(p => p.status === 'feedback_received').length,
    done:     projects.filter(p => p.status === 'completed').length,
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', background: '#F5F5F5', minHeight: '100vh', fontFamily: '-apple-system, "Hiragino Sans", sans-serif' }}>

      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '0.5px solid #E8E8E8', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ width: 72 }}>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', fontSize: '12px', color: '#CCC', cursor: 'pointer', padding: 0 }}>
            ログアウト
          </button>
        </div>
        <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '0.01em' }}>案件一覧</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 72, justifyContent: 'flex-end' }}>
          <Link to="/admin/settings" style={{ textDecoration: 'none', lineHeight: 1 }}>
            <span style={{ fontSize: 18, color: '#CCC', cursor: 'pointer' }}>⚙</span>
          </Link>
          <Link to="/admin/projects/new" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '7px 14px', borderRadius: '20px', border: 'none', background: GRAD, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ＋ 新規
            </button>
          </Link>
        </div>
      </div>

      <div style={{ padding: '14px 14px 40px' }}>

        {/* 集計カード */}
        <div style={{ background: '#fff', borderRadius: '18px', border: '0.5px solid #E8E8E8', display: 'flex', marginBottom: '16px', overflow: 'hidden' }}>
          {[
            { label: '確認待ち', count: stats.waiting },
            { label: 'FB受信',   count: stats.feedback },
            { label: '投稿完了', count: stats.done },
          ].map((s, i) => (
            <div key={s.label} style={{
              flex: 1, padding: '14px 8px', textAlign: 'center',
              borderLeft: i > 0 ? '0.5px solid #E8E8E8' : 'none',
            }}>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{s.count}</div>
              <div style={{ fontSize: '10px', color: '#AAA', marginTop: '5px', fontWeight: 600, letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 案件ラベル */}
        <p style={{ fontSize: '11px', color: '#BBB', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '8px' }}>案件</p>

        {loading && <p style={{ color: '#CCC', textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>読み込み中...</p>}

        {!loading && projects.length === 0 && (
          <div style={{ background: '#fff', borderRadius: '18px', border: '0.5px solid #E8E8E8', padding: '40px 20px', textAlign: 'center', color: '#CCC' }}>
            <p style={{ margin: 0, fontSize: '13px' }}>案件がまだありません</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {projects.map(project => {
            const statusInfo = STATUS_LABELS[project.status] || STATUS_LABELS.draft;
            const badgeStyle = BADGE_STYLES[statusInfo.badge] || BADGE_STYLES['b-rev'];
            const createdAt = project.createdAt?.toDate
              ? project.createdAt.toDate().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
              : '---';
            const isConfirming = confirmDeleteId === project.id;

            return (
              <div key={project.id}>
                <Link
                  to={`/admin/projects/${project.id}`}
                  style={{ textDecoration: 'none' }}
                  onClick={e => isConfirming && e.preventDefault()}
                >
                  <div style={{ background: '#fff', borderRadius: isConfirming ? '18px 18px 0 0' : '18px', border: '0.5px solid #E8E8E8', borderBottom: isConfirming ? 'none' : undefined, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>
                        {project.projectTitle || project.clientName || '（案件名なし）'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', ...badgeStyle }}>
                          {statusInfo.label}
                        </span>
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(isConfirming ? null : project.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#CCC', fontSize: 16, lineHeight: 1 }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#AAA' }}>
                      作成：{createdAt}　写真：{project.mainPhotoCount ?? 0}枚
                      {project.reviewerCount > 0
                        ? <>　<span style={{ color: '#555', fontWeight: 600 }}>{project.reviewerCount}人確認</span>　{project.ngPhotoIds?.length > 0 ? <span style={{ color: '#E24B4A' }}>NG: {project.ngPhotoIds.length}枚</span> : <span style={{ color: '#00A651' }}>全員OK</span>}</>
                        : (project.approvedCount > 0 && `　OK：${project.approvedCount}枚`)
                      }
                    </div>
                  </div>
                </Link>

                {/* 削除確認パネル */}
                {isConfirming && (
                  <div style={{ background: '#FFEBEB', borderRadius: '0 0 18px 18px', border: '0.5px solid #E8E8E8', borderTop: 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#E24B4A', fontWeight: 600 }}>この案件を削除しますか？</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ padding: '6px 14px', borderRadius: 10, border: '0.5px solid #E8E8E8', background: '#fff', fontSize: 12, color: '#888', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        disabled={deleteLoading}
                        style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: '#E24B4A', fontSize: 12, color: '#fff', fontWeight: 600, cursor: deleteLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {deleteLoading ? '削除中...' : '削除する'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
