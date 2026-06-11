import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

// 画像をJPEGに圧縮（長辺maxDim・品質quality）
// スマホ写真をそのままアップロードすると確認ページの表示が遅く、
// Instagram Graph APIの画像サイズ上限（8MB）にも触れるため
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function compressImage(file, maxDim, quality = 0.85) {
  const img   = await loadImage(file);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('圧縮に失敗しました')), 'image/jpeg', quality));
}

// 写真本体（1440px）とサムネイル（800px）を圧縮アップロードしてURLを返す
export async function uploadPhoto(projectId, file) {
  const id  = crypto.randomUUID();
  const r   = ref(storage, `projects/${projectId}/photos/${id}.jpg`);
  const tr  = ref(storage, `projects/${projectId}/thumbnails/${id}.jpg`);
  await uploadBytes(r,  await compressImage(file, 1440, 0.85));
  await uploadBytes(tr, await compressImage(file, 800, 0.8));
  const [storageUrl, thumbnailUrl] = await Promise.all([getDownloadURL(r), getDownloadURL(tr)]);
  return { storageUrl, thumbnailUrl };
}
