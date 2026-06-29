import { createContext, useContext, useEffect, useState } from 'react';
import { type Session, type AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type SignUpResult = {
  error: string | null;
  needsVerification: boolean;
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
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
