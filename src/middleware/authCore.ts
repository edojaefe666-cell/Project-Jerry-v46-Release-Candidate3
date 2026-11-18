import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

type VerifyIdToken = (token: string, checkRevoked: boolean) => Promise<DecodedIdToken>;

/** Testable Firebase bearer-token authentication boundary. */
export const createRequireAuth = (verifyIdToken: VerifyIdToken) => async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  try {
    const decodedToken = await verifyIdToken(token, true);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
