import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type Session, type AuthError } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';
import '@/lib/googleAuth'; // GoogleSignin.configure()를 앱 시작 시 1회 실행(AuthProvider가 루트에서 항상 마운트되므로)

type SignUpResult = {
  error: string | null;
  needsVerification: boolean;
};

type AuthContextValue = {
  session: Session | null;
  /** null = 확인 중, false = 프로필 없음(온보딩 필요), true = 프로필 있음 */
  hasProfile: boolean | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // session 확정 + profile 확인이 모두 끝날 때까지 loading
  const loading = authLoading || hasProfile === null;

  const checkProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    setHasProfile(data !== null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkProfile(session.user.id);
      } else {
        setHasProfile(false); // 비로그인 — 값 자체는 의미없지만 null 해소
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setHasProfile(null); // 재확인 시작 (loading = true로 되돌림)
        checkProfile(session.user.id);
      } else {
        setHasProfile(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkProfile]);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? mapAuthError(error) : null;
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: mapAuthError(error), needsVerification: false };
    return { error: null, needsVerification: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // 구글 로그인이 아니었어도 안전(그냥 아무 캐시된 구글 세션도 없는 상태) — best-effort
    await GoogleSignin.signOut().catch(() => {});
  };

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    await checkProfile(session.user.id);
  }, [session, checkProfile]);

  return (
    <AuthContext.Provider value={{ session, hasProfile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function mapAuthError(error: AuthError): string {
  const msg = error.message.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return '이메일 또는 비밀번호를 확인해주세요.';
  }
  if (msg.includes('email not confirmed')) {
    return '이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return '이미 가입된 이메일입니다.';
  }
  if (msg.includes('password should be at least')) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  if (msg.includes('unable to validate email address')) {
    return '올바른 이메일 주소를 입력해주세요.';
  }
  return '오류가 발생했습니다. 다시 시도해주세요.';
}
