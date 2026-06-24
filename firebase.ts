/**
 * Firebase initialization.
 *
 * Configure via Vite environment variables in a `.env` file at the project root:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_FIREBASE_PROJECT_ID=...
 *   VITE_FIREBASE_STORAGE_BUCKET=...
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 *
 * See FIREBASE_SETUP.md for full instructions.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain
);

let app: FirebaseApp | null = null;
let _firestore: Firestore | null = null;
let _auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  _firestore = getFirestore(app);
  _auth = getAuth(app);
}

export const firestore = _firestore as Firestore;
export const auth = _auth as Auth;
export { app };
