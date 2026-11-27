import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase';

declare global {
  interface Window {
    JerryNativeAuth?: {
      postMessage: (message: string) => void;
      onmessage: ((event: MessageEvent<string>) => void) | null;
    };
  }
}

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  idToken: null,
  loading: true,
  authError: null,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handleNativeAuthResult = (event: Event) => {
      const idToken = (event as CustomEvent<{ idToken?: string }>).detail?.idToken;
      if (!idToken) {
        setAuthError('Android sign-in did not return a valid Google identity token.');
        return;
      }
      void signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
        .then(async (result) => {
          setUser(result.user);
          setIdToken(await result.user.getIdToken());
          setAuthError(null);
        })
        .catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : 'Google sign-in failed.');
        });
    };
    const handleNativeAuthError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setAuthError(message || 'Google sign-in was cancelled or unavailable.');
    };
    window.addEventListener('jerry-native-auth-result', handleNativeAuthResult);
    window.addEventListener('jerry-native-auth-error', handleNativeAuthError);
    return () => {
      window.removeEventListener('jerry-native-auth-result', handleNativeAuthResult);
      window.removeEventListener('jerry-native-auth-error', handleNativeAuthError);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const token = await nextUser.getIdToken();
          setIdToken(token);
        } catch {
          setIdToken(null);
        }
      } else {
        setIdToken(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (window.JerryNativeAuth?.postMessage) {
      try {
        window.JerryNativeAuth.postMessage('signInWithGoogle');
      } catch {
        setAuthError('Android Google sign-in could not be started.');
      }
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const token = await result.user.getIdToken();
      setUser(result.user);
      setIdToken(token);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Google sign-in was cancelled or blocked.';
      setAuthError(message);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setUser(null);
    setIdToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, idToken, loading, authError, signInWithGoogle, signOutUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
