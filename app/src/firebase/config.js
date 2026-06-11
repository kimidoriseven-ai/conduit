import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyAMGMz1NSN_cGKu_SUD5KvFniyd3J5UJXA",
  authDomain: "instagram-post-confirm.firebaseapp.com",
  projectId: "instagram-post-confirm",
  storageBucket: "instagram-post-confirm.firebasestorage.app",
  messagingSenderId: "387073963446",
  appId: "1:387073963446:web:d69fea4209a010ad4bfd17"
};

const app = initializeApp(firebaseConfig);

export const db        = getFirestore(app);
export const storage   = getStorage(app);
export const auth      = getAuth(app);
export const functions = getFunctions(app, 'asia-northeast1');
setPersistence(auth, browserLocalPersistence);
export default app;
