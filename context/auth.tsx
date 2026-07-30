import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type Session, type AuthError } from '@supabase/supabase-js';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';
import '@/lib/googleAuth'; // GoogleSignin.configure()를 앱 시작 시 1회 실행(AuthProvider가 루트에서 항상 마운트되므로)

type SignUpResult = {
  error: string | null;
  needsVerification: boolean;
};

/**
 * 프로필 존재 여부 판정 상태.
 *   'checking' — 확인 중(스플래시 유지)
 *   'exists'   — 프로필 있음 → 메인
 *   'none'     — 프로필 없음 → 온보딩
 *   'error'    — 조회 실패로 판정 불가. ⚠️ 'none'과 반드시 구분할 것 —
 *                하나로 합치면 조회가 실패했을 뿐인 기존 사용자가 온보딩으로 튄다.
 */
export type ProfileStatus = 'checking' | 'exists' | 'none' | 'error';

type AuthContextValue = {
  session: Session | null;
  profileStatus: ProfileStatus;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('checking');
  const [authLoading, setAuthLoading] = useState(true);
  // 마지막으로 "확정된" 판정('exists' | 'none'). 조회 실패 시 여기로 되돌아간다.
  // 로그아웃하면 비워서 다음 사용자가 이전 판정을 물려받지 않게 한다.
  const lastKnownRef = useRef<'exists' | 'none' | null>(null);

  // session 확정 + profile 확인이 모두 끝날 때까지 loading
  const loading = authLoading || profileStatus === 'checking';

  // ⚠️ fail-closed: 조회가 실패하면 "프로필 없음"으로 단정하지 않는다.
  // 예전엔 error를 보지 않고 data === null만 봤는데, 네트워크가 끊긴 콜드스타트에서
  // data가 null이 되면서 프로필이 멀쩡히 있는 사용자가 온보딩으로 튀었다
  // (비행기 모드로 재현 확인). Phase J의 username 중복확인 수정과 같은 원칙 —
  // 확인하지 못한 것을 "없음"으로 단정하지 말 것.
  // 여기서 'checking'으로 되돌리지 않는 건 재시도 중 화면이 깜빡이지 않게 하려는 것 —
  // 'checking' 전환은 호출부(세션 변경 시점)가 명시적으로 한다.
  const checkProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('프로필 확인 실패:', error);
      // 이전에 확정된 판정이 있으면 그것을 유지한다 — 앱을 쓰던 중 토큰 갱신 등으로
      // 재확인이 실패했다고 해서 잘 쓰던 사용자를 에러 화면으로 쫓아내지 않는다.
      // 확정된 적이 없을 때(콜드스타트)만 'error'로 떨어져 재시도 UI를 띄운다.
      setProfileStatus(lastKnownRef.current ?? 'error');
      return;
    }
    const next = data !== null ? 'exists' : 'none';
    lastKnownRef.current = next;
    setProfileStatus(next);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkProfile(session.user.id);
      } else {
        lastKnownRef.current = null;
        setProfileStatus('none'); // 비로그인 — 값 자체는 의미없지만 'checking' 해소
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // 확정된 판정이 없을 때만 'checking'으로 되돌린다 — 이미 'exists'로 확정된
        // 사용자가 토큰 갱신 이벤트마다 스플래시 게이트로 되돌아가지 않게.
        if (lastKnownRef.current === null) setProfileStatus('checking');
        checkProfile(session.user.id);
      } else {
        lastKnownRef.current = null;
        setProfileStatus('none');
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
    <AuthContext.Provider value={{ session, profileStatus, loading, signIn, signUp, signOut, refreshProfile }}>
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
