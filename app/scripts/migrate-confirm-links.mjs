// 既存 projects の confirmToken から confirmLinks/{token} ルックアップを作成する一回限りの移行スクリプト。
// 中間ルール（projects read 開放 + confirmLinks の検証付き create）のデプロイ後に実行する:
//   node scripts/migrate-confirm-links.mjs
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAMGMz1NSN_cGKu_SUD5KvFniyd3J5UJXA",
  authDomain: "instagram-post-confirm.firebaseapp.com",
  projectId: "instagram-post-confirm",
  storageBucket: "instagram-post-confirm.firebasestorage.app",
  messagingSenderId: "387073963446",
  appId: "1:387073963446:web:d69fea4209a010ad4bfd17"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'projects'));
console.log(`projects: ${snap.size}件`);

let created = 0, skipped = 0;
for (const pDoc of snap.docs) {
  const { confirmToken, confirmTokenExpiresAt } = pDoc.data();
  if (!confirmToken) { console.warn(`SKIP ${pDoc.id}: confirmToken なし`); skipped++; continue; }
  const linkRef = doc(db, 'confirmLinks', confirmToken);
  const existing = await getDoc(linkRef);
  if (existing.exists() && existing.data().projectId === pDoc.id) {
    console.log(`OK   ${pDoc.id} (既存)`);
    skipped++;
    continue;
  }
  await setDoc(linkRef, {
    projectId: pDoc.id,
    expiresAt: confirmTokenExpiresAt ?? null,
    createdAt: serverTimestamp(),
  });
  console.log(`MIGRATED ${pDoc.id} -> confirmLinks/${confirmToken}`);
  created++;
}
console.log(`完了: 作成 ${created}件 / スキップ ${skipped}件`);
process.exit(0);
