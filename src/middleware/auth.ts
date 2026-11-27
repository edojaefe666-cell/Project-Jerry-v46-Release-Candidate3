import { adminAuth } from '../lib/firebase-admin.ts';
import { createRequireAuth, type AuthRequest } from './authCore.ts';
export type { AuthRequest } from './authCore.ts';

// Set this server-side secret to the sole owner's Firebase UID.
// Production fails closed when it is absent.
export const requireAuth = createRequireAuth(
  (token, checkRevoked) => adminAuth.verifyIdToken(token, checkRevoked),
  { ownerUid: process.env.JERRY_OWNER_UID, requireOwner: process.env.NODE_ENV === 'production' },
);
