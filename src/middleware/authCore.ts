import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

type VerifyIdToken = (token: string, checkRevoked: boolean) => Promise<DecodedIdToken>;

export interface OwnerAuthPolicy {
  /** The one Firebase UID permitted to use this Jerry deployment. */
  ownerUid?: string;
  /** Production deployments must fail closed when ownerUid is not configured. */
  requireOwner?: boolean;
}

/** Testable Firebase bearer-token authentication and single-owner authorization boundary. */
export const createRequireAuth = (
  verifyIdToken: VerifyIdToken,
  policy: OwnerAuthPolicy = {},
) => async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const ownerUid = policy.ownerUid?.trim();

  // Never silently turn a production Jerry deployment into a multi-user service
  // because its owner identity was omitted from deployment configuration.
  if (policy.requireOwner && !ownerUid) {
    res.status(503).json({ error: 'Jerry owner authorization is not configured.' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !/^Bearer\\s+\\S+$/i.test(authHeader)) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.replace(/^Bearer\\s+/i, '');
  try {
    const decodedToken = await verifyIdToken(token, true);

    // When configured, the allowlist applies in every environment. Production
    // additionally requires it to exist (see requireAuth below).
    if (ownerUid && decodedToken.uid !== ownerUid) {
      res.status(403).json({ error: 'Forbidden: This Jerry instance is owner-only.' });
      return;
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
