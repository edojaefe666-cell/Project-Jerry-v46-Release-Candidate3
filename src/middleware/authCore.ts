import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request { user?: DecodedIdToken; }
type VerifyIdToken = (token: string, checkRevoked: boolean) => Promise<DecodedIdToken>;
export interface OwnerAuthPolicy { ownerUid?: string; requireOwner?: boolean; }

/** Testable Firebase bearer-token authentication and single-owner authorization boundary. */
export const createRequireAuth = (verifyIdToken: VerifyIdToken, policy: OwnerAuthPolicy = {}) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const ownerUid = policy.ownerUid?.trim();
    if (policy.requireOwner && !ownerUid) {
      res.status(503).json({ error: 'Jerry owner authorization is not configured.' });
      return;
    }
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer\s+\S+$/i.test(header)) {
      res.status(401).json({ error: 'Unauthorized: Missing token' });
      return;
    }
    try {
      const decoded = await verifyIdToken(header.replace(/^Bearer\s+/i, ''), true);
      if (ownerUid && decoded.uid !== ownerUid) {
        res.status(403).json({ error: 'Forbidden: This Jerry instance is owner-only.' });
        return;
      }
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  };
