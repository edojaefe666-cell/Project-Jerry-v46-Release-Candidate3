import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import {
  onAuthStateChanged, signInWithPopup, signInWithCredential,
  reauthenticateWithCredential, reauthenticateWithPopup,
  GoogleAuthProvider, signOut, type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase';

declare global {
  interface Window {
    JerryNativeAuth?: { postMessage: (message: string) => void; onmessage: ((event: MessageEvent<string>) => void) | null; };
  }
}

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  reauthenticateWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, idToken: null, loading: true, authError: null,
  signInWithGoogle: async () => {}, reauthenticateWithGoogle: async () => {}, signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const pendingReauthentication = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);

  useEffect(() => {
    const handleNativeAuthResult = (event: Event) => {
      const detail = (event as CustomEvent<{ idToken?: string; mode?: string }>).detail;
      const idToken = detail?.idToken;
      if (!idToken) {
        const error = new Error('Android authentication did not return a valid Google identity token.');
        if (detail?.mode === 'reauthenticate') {
          const pending = pendingReauthentication.current;
          pendingReauthentication.current = null;
          pending?.reject(error);
        } else setAuthError(error.message);
        return;
      }
      if (detail?.mode === 'reauthenticate') {
        const currentUser = auth.currentUser;
        const pending = pendingReauthentication.current;
        if (!currentUser || !pending) {
          pendingReauthentication.current = null;
          pending?.reject(new Error('The signed-in Jerry account changed before reauthentication completed.'));
          return;
        }
        void reauthenticateWithCredential(currentUser, GoogleAuthProvider.credential(idToken))
          .then(async (result) => {
            const token = await result.user.getIdToken(true);
            setUser(result.user); setIdToken(token); setAuthError(null);
            if (pendingReauthentication.current === pending) pendingReauthentication.current = null;
            pending.resolve();
          })
          .catch((cause: unknown) => {
            const error = cause instanceof Error ? cause : new Error('Google reauthentication failed.');
            if (pendingReauthentication.current === pending) pendingReauthentication.current = null;
            pending.reject(error); setAuthError(error.message);
          });
        return;
      }
      void signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
        .then(async (result) => { setUser(result.user); setIdToken(await result.user.getIdToken()); setAuthError(null); })
        .catch((cause: unknown) => setAuthError(cause instanceof Error ? cause.message : 'Google sign-in failed.'));
    };
    const handleNativeAuthError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; mode?: string }>).detail;
      const message = detail?.message || 'Google authentication was cancelled or unavailable.';
      if (detail?.mode === 'reauthenticate') {
        const pending = pendingReauthentication.current;
        pendingReauthentication.current = null;
        pending?.reject(new Error(message));
      } else setAuthError(message);
    };
    window.addEventListener('jerry-native-auth-result', handleNativeAuthResult);
    window.addEventListener('jerry-native-auth-error', handleNativeAuthError);
    return () => {
      window.removeEventListener('jerry-native-auth-result', handleNativeAuthResult);
      window.removeEventListener('jerry-native-auth-error', handleNativeAuthError);
      const pending = pendingReauthentication.current;
      pendingReauthentication.current = null;
      pending?.reject(new Error('Authentication screen closed before reauthentication completed.'));
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) { try { setIdToken(await nextUser.getIdToken()); } catch { setIdToken(null); } }
      else setIdToken(null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (window.JerryNativeAuth?.postMessage) {
      try { window.JerryNativeAuth.postMessage('signInWithGoogle'); }
      catch { setAuthError('Android Google sign-in could not be started.'); }
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      setUser(result.user); setIdToken(await result.user.getIdToken());
    } catch (cause: unknown) {
      setAuthError(cause instanceof Error ? cause.message : 'Google sign-in was cancelled or blocked.');
    }
  }, []);

  const reauthenticateWithGoogle = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sign in to Jerry before confirming your identity.');
    setAuthError(null);
    if (window.JerryNativeAuth?.postMessage) {
      if (pendingReauthentication.current) throw new Error('A Google reauthentication request is already in progress.');
      await new Promise<void>((resolve, reject) => {
        pendingReauthentication.current = { resolve, reject };
        try { window.JerryNativeAuth?.postMessage('reauthenticateWithGoogle'); }
        catch (cause) {
          pendingReauthentication.current = null;
          reject(cause instanceof Error ? cause : new Error('Android Google reauthentication could not be started.'));
        }
      });
      return;
    }
    try {
      const result = await reauthenticateWithPopup(currentUser, googleAuthProvider);
      setUser(result.user); setIdToken(await result.user.getIdToken(true));
    } catch (cause: unknown) {
      const error = cause instanceof Error ? cause : new Error('Google reauthentication failed.');
      setAuthError(error.message); throw error;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    const pending = pendingReauthentication.current;
    pendingReauthentication.current = null;
    pending?.reject(new Error('Signed out before reauthentication completed.'));
    await signOut(auth); setUser(null); setIdToken(null);
  }, []);

  return <AuthContext.Provider value={{ user, idToken, loading, authError, signInWithGoogle, reauthenticateWithGoogle, signOutUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
