import { adminAuth } from '../lib/firebase-admin.ts';
import { createRequireAuth, type AuthRequest } from './authCore.ts';

export type { AuthRequest } from './authCore.ts';

export const requireAuth = createRequireAuth((token, checkRevoked) =>
  adminAuth.verifyIdToken(token, checkRevoked)
);
