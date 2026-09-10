import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { Map, Camera, GeoJSONSource, Layer, type PressEvent } from '@maplibre/maplibre-react-native';
import { Text } from '@/components/AppText';
import { TextInput } from '@/components/AppTextInput';
import { VisibilitySelector } from '@/components/VisibilitySelector';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { getCountryFromCoord, getCountryCentroid, type CountryMatch } from '@/lib/countryFromCoord';
import { getSggBounds } from '@/lib/sggGeo';
import { getCountryNameKo } from '@/lib/countryNamesKo';
import { savePost, type PostVisibility } from '@/lib/posts';
import countriesGeoJSON from '@/assets/geo/countries.json';
// 지도 탭이 이미 import 하는 같은 모듈 — 번들에 한 번만 들어가므로 용량 증가가 없다.
import sggGeoJSON from '@/data/kr-sgg/sgg_kr_render.json';

const MAX_PHOTOS = 10;
// 현재 위치 측위에 씌우는 상한. expo-location의 getCurrentPositionAsync에는
// 타임아웃 옵션이 없다(LocationOptions는 accuracy/mayShowUserSettingsDialog/
// timeInterval/distanceInterval 4개뿐) — 측위가 안 잡히면 promise가 영원히
// resolve되지 않아 gpsLoading이 굳고, 그러면 게시 버튼이 영영 안 열린다.
// 실내·지하·약전계에서 실제로 일어나는 상황이라 밖에서 상한을 씌운다.
const GPS_TIMEOUT_MS = 15000;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// 위치 선택용 미니맵 — MapScreen과 같은 인라인 스타일, 나라 채색 없이 배경만.
const PICKER_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#EBF1F7' } },
  ],
};

// ⚠️ race로 빠져나가도 네이티브 측위는 계속 돌고 나중에 resolve될 수 있다.
// 늦은 응답이 사용자가 그새 직접 찍은 핀을 덮어쓰는 건 호출부의 세대 ref가 막는다
// (gpsRequestIdRef — Phase D-2/I의 requestIdRef 패턴과 같은 것).
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => { setTimeout(() => resolve(null), ms); }),
  ]);
}

type PickedCoord = {
  lng: number;
  lat: number;
};

// 핀 좌표의 출처. canPost 가드를 좁히는 데 쓴다 — 아래 awaitingFix 참고.
//  'gps-cache' = 캐시 좌표로 임시로 찍은 핀. **정정이 예정돼 있다.**
//  'gps'       = 실제 측위로 확정된 좌표
//  'manual'    = 사용자가 지도를 탭하거나 핀을 끌어 지정한 좌표.
//                정정이 오지 않으므로 곧바로 게시 가능하다.
type CoordSource = 'gps-cache' | 'gps' | 'manual';

type PhotoStatus = 'resizing' | 'uploading' | 'done' | 'error';

type PhotoItem = {
  id: string;
  uri: string;
  status: PhotoStatus;
  path?: string;
  error?: string;
};

export default function ComposeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  // 진입 화면이 넘겨준 값들. **전부 미니맵 초기 카메라와 복귀 경로에만 쓰인다** —
  // 최종 country_code 는 언제나 핀 좌표에서 파생한다(핀이 진실). 그래서 시군구에서
  // 열어도 사용자가 핀을 다른 나라로 옮기면 헤더·저장이 그 나라를 따라간다.
  //
  // returnTo 를 두는 이유: 저장 후 복귀를 **호출부가 정한다**. 없으면 compose 가
  // 항상 나라상세로 pop 하는데, 시군구에서 열었을 땐 스택에 나라상세가 없어서
  // POP_TO 가 "현재 화면을 지우고 새로 얹는" 분기로 빠진다(@react-navigation/
  // routers StackRouter.tsx) — 크래시는 아니지만 스택이 어긋난다.
  // 기본값(생략)이 'country' 라 나라상세 경로는 동작이 그대로다.
  const {
    cc: entryCc,
    returnTo,
    sggOsmId,
    sggName,
  } = useLocalSearchParams<{
    cc?: string;
    returnTo?: 'country' | 'sgg';
    sggOsmId?: string;
    sggName?: string;
  }>();
  const initialCenter = entryCc ? getCountryCentroid(entryCc) : null;
  // 시군구에서 진입했으면 그 시군구 전체가 담기도록 bounds 로 연다.
  const sggBounds = sggOsmId ? getSggBounds(Number(sggOsmId)) : null;

  // savePost(C-2-3a)와 사진 업로드 경로가 같은 postId를 공유 — 게시 전에도 미리 생성해둔다.
  const [postId] = useState(() => Crypto.randomUUID());

  const [pickedCoord, setPickedCoord] = useState<PickedCoord | null>(null);
  const [countryMatch, setCountryMatch] = useState<CountryMatch | null>(null);
  const [coordSource, setCoordSource] = useState<CoordSource | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  // 진행을 막지 않는 안내(핀은 있고 게시도 가능한 상태) — 빨간 errorText 대신
  // 회색 hintText로 보여준다. 붉게 띄우면 못 쓰는 상태로 오해된다.
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  // ⭐ 진행 중인 측위 요청의 세대. 늦게 도착한 응답이 그새 사용자가 직접 찍은
  // 핀을 덮어쓰는 것을 막는다 — 타임아웃으로 race에서 빠져나와도 네이티브
  // 측위는 계속 돌기 때문에 이 가드가 없으면 "핀 찍고 글 쓰는 중에 갑자기
  // 위치가 바뀌는" 버그가 난다.
  const gpsRequestIdRef = useRef(0);

  const [placeLabel, setPlaceLabel] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);

  function handleCoordPicked(lng: number, lat: number, source: CoordSource) {
    setLocationError(null);
    setLocationNotice(null);
    setPickedCoord({ lng, lat });
    setCoordSource(source);
    setCountryMatch(getCountryFromCoord(lng, lat));
  }

  // 진행 중인 측위를 무효화하고 로딩을 해제한다. 세대만 올리고 끝내면
  // 그 요청의 finally가 stale로 판정돼 gpsLoading을 못 내리므로(그게 바로
  // 이번에 고치는 버그다) 여기서 같이 내린다.
  function cancelGpsRequest() {
    gpsRequestIdRef.current += 1;
    setGpsLoading(false);
  }

  // 사용자가 직접 찍은 핀은 언제나 진실이다 — 진행 중인 측위가 있으면
  // 취소해서 늦은 응답이 이 핀을 덮어쓰지 못하게 한다.
  function handleManualPick(lng: number, lat: number) {
    cancelGpsRequest();
    handleCoordPicked(lng, lat, 'manual');
  }

  function handleMapPress(event: NativeSyntheticEvent<PressEvent>) {
    const [lng, lat] = event.nativeEvent.lngLat;
    handleManualPick(lng, lat);
  }

  async function handleUseCurrentLocation() {
    const requestId = ++gpsRequestIdRef.current;
    // 이 요청이 아직 최신인가. 사용자가 지도를 탭했거나(handleManualPick)
    // 취소했거나 버튼을 다시 눌렀으면 세대가 올라가 stale이 된다.
    const isStale = () => gpsRequestIdRef.current !== requestId;

    setLocationError(null);
    setLocationNotice(null);
    setGpsLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (isStale()) return;
      if (!permission.granted) {
        setLocationError('위치 권한이 거부됐어요. 지도에서 직접 선택해주세요.');
        return;
      }

      // ⭐ 먼저 마지막으로 알려진 위치로 핀을 즉시 찍는다.
      // getCurrentPositionAsync는 새 측위를 기다리므로 실기기(특히 실내)에서
      // 몇 초씩 걸린다 — expo-location 공식 문서도 "빠른 응답이 필요하면
      // getLastKnownPositionAsync를 쓰라"고 권한다. 캐시가 없으면 null이라
      // 그때는 기존과 동일하게 새 측위만 기다린다.
      // maxAge/requiredAccuracy로 너무 오래됐거나 부정확한 캐시는 걸러낸다.
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 2 * 60 * 1000,
        requiredAccuracy: 500,
      });
      if (isStale()) return;
      if (lastKnown) {
        handleCoordPicked(lastKnown.coords.longitude, lastKnown.coords.latitude, 'gps-cache');
      }

      // 그다음 실제 측위로 핀을 정정한다. 캐시 핀 상태에서는 이게 끝나야
      // 게시가 열린다(awaitingFix) — 곧 덮어써질 좌표로 저장돼 서버의 시군구
      // 판정이 어긋나는 걸 막기 위함이다.
      // ⭐ 단 상한을 씌운다. 그냥 await하면 측위가 안 잡힐 때 영영 안 끝나고
      //    gpsLoading이 굳어 게시가 영구히 막힌다(T-2에서 고친 버그).
      const position = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        GPS_TIMEOUT_MS,
      );
      if (isStale()) return;

      if (!position) {
        // 타임아웃. 캐시 핀이 있으면 버리지 않고 남긴다 — 대략적이라도
        // 출발점이 있는 편이 낫고, 사용자가 끌어서 맞출 수 있다.
        // 이 시점부터는 정정이 오지 않으므로 'manual'로 승격해 게시를 연다.
        if (lastKnown) {
          setCoordSource('manual');
          setLocationNotice('정확한 위치를 잡지 못했어요. 핀이 대략 위치에 있으니 끌어서 맞춰주세요.');
        } else {
          setLocationError('현재 위치를 가져오지 못했어요. 지도에서 직접 선택해주세요.');
        }
        return;
      }

      handleCoordPicked(position.coords.longitude, position.coords.latitude, 'gps');
    } catch (err) {
      if (isStale()) return;
      console.error('[C-2-2b] 현재 위치 획득 실패:', err);
      setLocationError('현재 위치를 가져오지 못했어요. 지도에서 직접 선택해주세요.');
    } finally {
      // stale이면 gpsLoading은 새 요청(또는 취소)이 이미 소유하고 있다.
      if (!isStale()) setGpsLoading(false);
    }
  }

  async function handleAddPhotos() {
    const userId = session?.user.id;
    if (!userId) return;

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('권한 필요', '사진 접근 권한을 허용해주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;

    const assets = result.assets.slice(0, remaining);
    const newItems: PhotoItem[] = assets.map((asset) => ({ id: Crypto.randomUUID(), uri: asset.uri, status: 'resizing' }));
    setPhotos((prev) => [...prev, ...newItems]);

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const photoId = newItems[i].id;
      const path = `posts/${userId}/${postId}/${photoId}.jpg`;

      try {
        const resizeTo = asset.width >= asset.height
          ? { width: MAX_DIMENSION }
          : { height: MAX_DIMENSION };

        const rendered = await ImageManipulator.manipulate(asset.uri).resize(resizeTo).renderAsync();
        const resized = await rendered.saveAsync({
          compress: JPEG_QUALITY,
          format: SaveFormat.JPEG,
          base64: true,
        });
        if (!resized.base64) throw new Error('base64 인코딩 실패');

        setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status: 'uploading' } : p)));

        const { error } = await supabase.storage
          .from('post-media')
          .upload(path, decode(resized.base64), { contentType: 'image/jpeg' });
        if (error) throw error;

        setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status: 'done', path } : p)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[C-2-3b] 사진 업로드 실패:', path, message);
        setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, status: 'error', error: message } : p)));
      }
    }
  }

  async function handleRemovePhoto(photoId: string) {
    const target = photos.find((p) => p.id === photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    if (target?.path) {
      const { error } = await supabase.storage.from('post-media').remove([target.path]);
      if (error) console.error('[C-2-3b] 사진 삭제 실패:', error);
    }
  }

  const uploadingCount = photos.filter((p) => p.status === 'resizing' || p.status === 'uploading').length;
  // ⭐ 게시를 막아야 하는 건 "곧 덮어써질 캐시 좌표"일 때뿐이다.
  // 예전엔 gpsLoading 자체를 조건에 걸었는데, 그러면 측위가 진행 중인 동안
  // **사용자가 지도를 직접 탭해 찍은 핀으로도 게시가 안 됐다** — 측위가 영영
  // 안 끝나면 영구 차단이었다(T-2). 가드의 의도(캐시 좌표 저장 방지)는 그대로
  // 두고 조건만 좁힌다. 직접 찍은 핀('manual')은 정정이 오지 않으므로 즉시 열린다.
  const awaitingFix = gpsLoading && coordSource === 'gps-cache';
  const canPost = !!pickedCoord && !!countryMatch && uploadingCount === 0 && !saving && !awaitingFix;

  async function handleSave() {
    const userId = session?.user.id;
    if (!userId || !pickedCoord || !countryMatch) return;

    setSaving(true);
    try {
      const mediaPaths = photos.filter((p) => p.status === 'done' && p.path).map((p) => p.path!);
      await savePost({
        postId,
        userId,
        countryCode: countryMatch.cc,
        lng: pickedCoord.lng,
        lat: pickedCoord.lat,
        caption: caption.trim() || null,
        visibility,
        placeLabel: placeLabel.trim() || null,
        mediaPaths,
      });
      // E-2와 동일한 스택 문제: compose는 나라상세에서만 진입하므로(C-2-3b) 스택에
      // country/[cc]가 이미 있다. replace로 새 인스턴스를 또 쌓으면 스택에 country가
      // 중복되어 뒤로가기 시 삭제/저장 전 화면이 다시 보인다.
      // dismissTo(POP_TO)는 dynamic 세그먼트별 getId를 등록하지 않은 이상 스택에서
      // route 이름만으로 일치하는 화면을 찾는다 — country/[cc]는 compose 진입 경로상
      // 항상 유일하므로, 핀을 다른 나라에 찍어 진입 나라와 저장 나라(countryMatch.cc)가
      // 달라도 그 하나뿐인 country 화면을 찾아 그대로 재사용하고 params만 새 나라로
      // 덮어쓴다(별도 나라 분기 불필요). 포커스 전환이 일어나므로 나라상세의
      // useFocusEffect가 새 cc로 다시 조회해 방금 올린 게시물이 그리드에 뜬다.
      // 복귀는 **들어온 화면으로 고정**한다. 시군구에서 열었을 때 저장된 글이 어느
      // 시군구인지는 클라이언트가 모른다 — sgg_id 는 서버 트리거(set_post_sgg)가
      // 계산하고 savePost 는 아무것도 돌려주지 않기 때문이다. 알아내려면 저장 후
      // 추가 조회 + sgg_id→osm_relation_id 역매핑이 필요한데, 핀을 일부러 그
      // 시군구 밖으로 옮긴 드문 경우를 위해 쿼리를 늘릴 값어치가 없다.
      if (returnTo === 'sgg' && sggOsmId) {
        router.dismissTo({ pathname: '/sgg/[osmId]', params: { osmId: sggOsmId, name: sggName } } as any);
      } else {
        router.dismissTo({ pathname: '/country/[cc]', params: { cc: countryMatch.cc, nm: countryMatch.nm } } as any);
      }
    } catch (err) {
      console.error('[C-2-3a] 저장 실패:', err);
      Alert.alert('저장 실패', '잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerSideBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>취소</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>새 기록</Text>
          {countryMatch ? (
            <View style={styles.headerSubtitleRow}>
              <View style={styles.headerDot} />
              <Text style={styles.headerSubtitle}>{getCountryNameKo(countryMatch.cc, countryMatch.nm)}</Text>
            </View>
          ) : (
            <Text style={styles.headerSubtitlePlaceholder}>위치를 선택해주세요</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
          onPress={handleSave}
          disabled={!canPost}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.postBtnText}>게시</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* ── 위치 ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>위치</Text>
          <Text style={styles.sectionHint}>지도를 탭하거나 핀을 끌어 옮기세요</Text>
        </View>

        <View style={styles.mapWrap}>
          <Map
            style={styles.map}
            mapStyle={PICKER_MAP_STYLE as any}
            onPress={handleMapPress}
            // ⭐⭐ dragPan을 명시하지 않으면 미니맵을 조작할 때 부모 ScrollView가
            //    같이 스크롤된다(실기기 보고). 네이티브가 부모의 터치 가로채기를
            //    막는 코드는 `scrollEnabled == true` 일 때만 도는데
            //    (MLRNMapView.kt onTouchEvent → requestDisallowInterceptTouchEvent),
            //    이 필드는 prop을 실제로 넘겨야 채워진다. 넘기지 않으면 null 이라
            //    조건을 통과하지 못한다 — 문서상 기본값이 true 라 헷갈리지만,
            //    "기본 동작"과 "부모 차단"은 별개다. 스크롤 안에 지도를 넣을 때는
            //    반드시 명시할 것.
            dragPan
            // 위치 선택용 지도라 회전·기울임은 필요 없고, 회전되면 나침반이
            // 떠서 화면을 가린다(지도 탭과 같은 판단).
            compass={false}
            touchRotate={false}
            touchPitch={false}
          >
            <Camera
              initialViewState={
                sggBounds
                  // ⚠️ padding 을 키우면 지도가 그만큼 더 축소돼 군도(옹진군 등)에서
                  //    육지가 더 작아진다. 가장자리에 닿지 않을 만큼만 준다.
                  ? { bounds: sggBounds, padding: { top: 16, right: 16, bottom: 16, left: 16 } }
                  : { center: initialCenter ?? [127.5, 36], zoom: initialCenter ? 3 : 2 }
              }
            />
            <GeoJSONSource id="compose-countries" data={countriesGeoJSON as any}>
              <Layer id="compose-country-fill" type="fill" paint={{ 'fill-color': '#CDD2D8', 'fill-opacity': 1 }} />
              <Layer id="compose-country-border" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 0.8 }} />
            </GeoJSONSource>
            {/* ⭐ 시군구 진입일 때만, 그 시군구 외곽선 한 겹.
                미니맵은 나라 fill 만 그리므로, bounds 로 확대해 열면 화면이 균일한
                회색 한 덩어리가 되어 **어디까지가 그 시군구인지 알 수 없다**
                ("확대는 됐는데 그 시군구가 안 보이는" 절반 상태).
                filter 로 진입한 하나만 그리므로 나라상세 경로에는 이 소스가 아예
                렌더되지 않는다. fill 은 주지 않는다 — 핀 색과 섞인다. */}
            {sggBounds && (
              <GeoJSONSource id="compose-sgg" data={sggGeoJSON as any}>
                <Layer
                  id="compose-sgg-line"
                  type="line"
                  filter={['==', ['get', 'osm_id'], Number(sggOsmId)] as any}
                  paint={{ 'line-color': theme.colors.accent, 'line-width': 2 }}
                />
              </GeoJSONSource>
            )}
            {/* ⭐⭐ 핀은 반드시 **마지막에** 선언한다 — 우리 레이어는 선언 순서대로
                style.addLayer() 로 맨 위에 쌓이므로, 마지막이 곧 최상단이다.
                ⚠️ 예전엔 ViewAnnotation(draggable)을 썼는데 **육지에서 핀이 아예
                   안 보였다.** 안드로이드의 ViewAnnotation 은 오버레이 View 가
                   아니라 SymbolManager 심볼이고, SymbolManager 는 스타일 로드
                   직후 만들어지는 반면(MLRNMapView.kt) 우리 Layer 들은 그 뒤에
                   맨 위로 얹히기 때문에(MLRNLayer.kt style.addLayer) 불투명한
                   country-fill 이 핀을 덮었다. 바다에서만 보이던 게 그 증거다.
                   자세한 경위는 CLAUDE.md 참고.
                circle 레이어면 순서를 우리가 100% 통제하고, 이미지 에셋도 필요
                없다(기존 핀이 주황 원 + 흰 테두리라 그대로 재현된다).
                드래그는 빠졌다 — 지도를 탭하면 핀이 그 자리로 옮겨간다. */}
            {pickedCoord && (
              <GeoJSONSource
                id="compose-pin"
                data={{
                  type: 'FeatureCollection',
                  features: [
                    {
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'Point', coordinates: [pickedCoord.lng, pickedCoord.lat] },
                    },
                  ],
                } as any}
              >
                <Layer
                  id="compose-pin-circle"
                  type="circle"
                  paint={{
                    'circle-radius': 8,
                    'circle-color': theme.colors.accent,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#FFFFFF',
                  }}
                />
              </GeoJSONSource>
            )}
          </Map>

          {/* 측위 중에는 '취소'로 바뀐다 — 상한(15초)이 있어도 그동안 갇혀 있게
              두면 안 되고, "GPS 없이 그냥 지도에서 찍겠다"가 이 기능의 요구다.
              disabled로 막아두면 재시도조차 못 한다(예전 동작). */}
          <TouchableOpacity
            style={styles.gpsChip}
            onPress={gpsLoading ? cancelGpsRequest : handleUseCurrentLocation}
          >
            {gpsLoading ? (
              <View style={styles.gpsChipBusy}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.gpsChipText}>취소</Text>
              </View>
            ) : (
              <Text style={styles.gpsChipText}>현재 위치</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 캐시 좌표로 핀을 먼저 찍은 상태 — 실제 측위가 끝나면 핀이 살짝
            움직일 수 있으므로 그 이유를 알려준다. */}
        {awaitingFix && (
          <Text style={styles.hintText}>위치를 더 정확하게 맞추는 중…</Text>
        )}
        {locationNotice && <Text style={styles.hintText}>{locationNotice}</Text>}
        {locationError && <Text style={styles.errorText}>{locationError}</Text>}
        {pickedCoord && !countryMatch && !locationError && (
          <Text style={styles.errorText}>나라를 찾을 수 없어요. 다른 위치를 선택해주세요.</Text>
        )}

        {/* ── 지역명 ── */}
        <TextInput
          style={styles.textInput}
          placeholder="이 위치의 이름 (선택)"
          placeholderTextColor={theme.colors.placeholder}
          value={placeLabel}
          onChangeText={setPlaceLabel}
        />

        {/* ── 사진 ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>사진</Text>
          <Text style={styles.photoCount}>
            <Text style={styles.photoCountNumber}>{photos.length}</Text> / {MAX_PHOTOS}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {photos.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhotoTile} onPress={handleAddPhotos}>
              <Text style={styles.addPhotoPlus}>+</Text>
              <Text style={styles.addPhotoLabel}>사진 추가</Text>
            </TouchableOpacity>
          )}
          {photos.map((photo, index) => (
            <View key={photo.id} style={styles.photoTile}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              {index === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>대표</Text>
                </View>
              )}
              {(photo.status === 'resizing' || photo.status === 'uploading') && (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
              {photo.status === 'error' && (
                <View style={styles.photoOverlay}>
                  <Text style={styles.photoErrorText}>실패</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemovePhoto(photo.id)}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        {/* ── 글 ── */}
        <Text style={styles.sectionTitle}>글</Text>
        <TextInput
          style={styles.captionInput}
          placeholder="이 곳에서의 기록을 남겨보세요"
          placeholderTextColor={theme.colors.placeholder}
          value={caption}
          onChangeText={setCaption}
          multiline
          textAlignVertical="top"
        />

        {/* ── 공개 범위 ── */}
        <Text style={styles.sectionTitle}>공개 범위</Text>
        <VisibilitySelector value={visibility} onChange={setVisibility} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSideBtn: {
    minWidth: 44,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textSecondary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  headerSubtitlePlaceholder: {
    fontSize: 12,
    color: theme.colors.placeholder,
    marginTop: 2,
  },
  postBtn: {
    minWidth: 64,
    backgroundColor: theme.colors.accent,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: theme.fonts.bold,
  },

  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    color: theme.colors.text,
  },
  sectionHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // 위치 미니맵
  mapWrap: {
    height: 200,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  gpsChip: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  gpsChipBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.accent,
  },

  // 지역명 / 글 입력
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
  },
  captionInput: {
    minHeight: 110,
    backgroundColor: '#f9fafb',
    borderRadius: theme.radius.card,
    padding: 14,
    fontSize: 14,
    color: theme.colors.text,
  },

  // 사진 스트립
  photoCount: {
    fontSize: 13,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textSecondary,
  },
  photoCountNumber: {
    color: theme.colors.accent,
  },
  photoStrip: {
    gap: 10,
    paddingRight: 4,
  },
  addPhotoTile: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoPlus: {
    fontSize: 22,
    color: theme.colors.accent,
    fontFamily: theme.fonts.regular,
    lineHeight: 24,
  },
  addPhotoLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  photoTile: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.input,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coverBadgeText: {
    fontSize: 10,
    fontFamily: theme.fonts.bold,
    color: '#fff',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoErrorText: {
    fontSize: 11,
    fontFamily: theme.fonts.bold,
    color: '#fff',
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: theme.fonts.bold,
  },
});
