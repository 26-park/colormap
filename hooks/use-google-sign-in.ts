import { useCallback, useState } from 'react';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const { idToken } = response.data;
        if (!idToken) {
          setError('구글 로그인에 실패했습니다. 다시 시도해주세요.');
          return;
        }
        const { error: authError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (authError) {
          console.error('signInWithIdToken 실패:', authError);
          setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
        // 성공 시 AuthProvider의 onAuthStateChange가 세션을 감지해 자동으로 리다이렉트
      } else if (isCancelledResponse(response)) {
        // 사용자가 취소 — 에러 표시 안 함
      }
    } catch (err) {
      if (isErrorWithCode(err)) {
        switch (err.code) {
          case statusCodes.IN_PROGRESS:
            setError('이미 로그인 진행 중이에요.');
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setError('Google Play 서비스를 사용할 수 없어요.');
            break;
          default:
            setError('구글 로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
      } else {
        setError('구글 로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { signInWithGoogle, loading, error };
}
