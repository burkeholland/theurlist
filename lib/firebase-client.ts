import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

// Lazy singletons — avoid initializing at module scope (breaks build without env vars)
let _auth: Auth | null = null;
let _database: Database | null = null;

export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_auth) _auth = getAuth(getFirebaseApp());
    const value = (_auth as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(_auth);
    }
    return value;
  },
  set(_, prop, value) {
    if (!_auth) _auth = getAuth(getFirebaseApp());
    (_auth as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
  has(_, prop) {
    if (!_auth) _auth = getAuth(getFirebaseApp());
    return prop in _auth;
  },
  getPrototypeOf() {
    if (!_auth) _auth = getAuth(getFirebaseApp());
    return Object.getPrototypeOf(_auth);
  },
});

export const database: Database = new Proxy({} as Database, {
  get(_, prop) {
    if (!_database) _database = getDatabase(getFirebaseApp());
    const value = (_database as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(_database);
    }
    return value;
  },
  set(_, prop, value) {
    if (!_database) _database = getDatabase(getFirebaseApp());
    (_database as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
  has(_, prop) {
    if (!_database) _database = getDatabase(getFirebaseApp());
    return prop in _database;
  },
  getPrototypeOf() {
    if (!_database) _database = getDatabase(getFirebaseApp());
    return Object.getPrototypeOf(_database);
  },
});
