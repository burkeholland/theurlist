import { adminAuth } from './firebase-admin';
import { NextRequest } from 'next/server';

export interface AuthResult {
  authenticated: boolean;
  uid: string | null;
  error?: string;
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return { authenticated: false, uid: null };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { authenticated: false, uid: null, error: 'Invalid authorization header format.' };
  }

  const token = match[1];
  
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { authenticated: true, uid: decoded.uid };
  } catch {
    return { authenticated: false, uid: null, error: 'Invalid or expired auth token.' };
  }
}

export function requireAuth(authResult: AuthResult): asserts authResult is AuthResult & { authenticated: true; uid: string } {
  if (!authResult.authenticated || !authResult.uid) {
    throw new AuthError('UNAUTHORIZED', 'Missing or invalid auth token.');
  }
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}
