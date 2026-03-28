import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (serviceAccount && serviceAccount !== '{}') {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccount)),
      databaseURL,
    });
  }

  return initializeApp({ databaseURL });
}

// Lazy singletons — avoid initializing at import time (breaks build without env vars)
let _adminAuth: Auth | null = null;
let _adminDb: Database | null = null;

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_adminAuth) _adminAuth = getAuth(getAdminApp());
    return (_adminAuth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const adminDb = new Proxy({} as Database, {
  get(_, prop) {
    if (!_adminDb) _adminDb = getDatabase(getAdminApp());
    return (_adminDb as unknown as Record<string | symbol, unknown>)[prop];
  },
});
