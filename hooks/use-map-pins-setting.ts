import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'settings.showMapPins';

/**
 * ⭐ 읽기 실패 시 기본값은 **켜짐(fail-open)** 이다.
 *
 * 비대칭이 판단 근거다:
 * - 잘못 **켜지면** 사용자 눈에 바로 보이고, 설정에서 다시 끄면 그만이다.
 * - 잘못 **꺼지면** 아무것도 안 보이는데 왜인지 알 방법이 없다 — 이 프로젝트가
 *   방금 "핀이 조용히 안 보이는" 문제로 빌드 한 사이클을 날린 그 실패 모드다.
 *   "조용히 안 보이는 모드를 만들지 않는다"는 원칙과도 일관된다.
 *
 * ⚠️ 사용자가 일부러 꺼놨는데 읽기 실패로 다시 켜지는 경우가 생길 수는 있다.
 * 그래도 위 비대칭 때문에 이쪽이 낫다고 판단했다 — 그 경우는 사용자가 상황을
 * **인지할 수 있고** 복구도 한 번의 토글이다. 반대 방향은 인지 자체가 안 된다.
 * (덧붙여 값이 없는 상태(`getItem` → null)는 에러가 아니라 "아직 설정한 적
 * 없음"이며, 그때도 같은 기본값을 쓴다.)
 */
export const SHOW_MAP_PINS_DEFAULT = true;

/**
 * "지도에 핀 표시" 설정. 지도 탭과 설정 화면이 공유한다.
 *
 * 전역 상태를 두지 않고 **포커스될 때마다 다시 읽는다** — 설정에서 바꾸고 지도
 * 탭으로 돌아오면 그 시점에 반영된다(이 프로젝트가 여기저기서 쓰는
 * `useFocusEffect` 재조회 패턴과 같다). 저장소 읽기는 로컬이라 비용이 없다.
 */
export function useMapPinsSetting() {
  const [showPins, setShowPins] = useState(SHOW_MAP_PINS_DEFAULT);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          if (cancelled) return;
          // null = 설정한 적 없음 → 기본값
          setShowPins(raw === null ? SHOW_MAP_PINS_DEFAULT : raw === 'true');
        })
        .catch((err) => {
          console.error('지도 핀 설정 읽기 실패:', err);
          if (!cancelled) setShowPins(SHOW_MAP_PINS_DEFAULT); // fail-open
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // 낙관적으로 화면을 먼저 바꾸고 저장한다. 저장이 실패하면 되돌린다 —
  // 조용히 어긋난 채로 두면 다음 포커스에 값이 튄다.
  const updateShowPins = useCallback(async (next: boolean) => {
    setShowPins(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, String(next));
    } catch (err) {
      console.error('지도 핀 설정 저장 실패:', err);
      setShowPins(!next);
      throw err;
    }
  }, []);

  return { showPins, setShowPins: updateShowPins };
}
