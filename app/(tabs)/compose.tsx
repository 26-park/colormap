import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { Map, Camera, ViewAnnotation, GeoJSONSource, Layer, type PressEvent } from '@maplibre/maplibre-react-native';
import { Text } from '@/components/AppText';
import { VisibilitySelector } from '@/components/VisibilitySelector';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { getCountryFromCoord, getCountryCentroid, type CountryMatch } from '@/lib/countryFromCoord';
import { getCountryNameKo } from '@/lib/countryNamesKo';
import { savePost, type PostVisibility } from '@/lib/posts';
import countriesGeoJSON from '@/assets/geo/countries.json';

const MAX_PHOTOS = 10;
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

type PickedCoord = {
  lng: number;
  lat: number;
};

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
  // 나라상세 "기록 추가"에서 넘어온 진입 나라 — 미니맵 초기 카메라 위치용일 뿐,
  // 최종 country_code는 항상 핀 좌표에서 파생한다(핀이 진실).
  const { cc: entryCc } = useLocalSearchParams<{ cc?: string; nm?: string }>();
  const initialCenter = entryCc ? getCountryCentroid(entryCc) : null;

  // savePost(C-2-3a)와 사진 업로드 경로가 같은 postId를 공유 — 게시 전에도 미리 생성해둔다.
  const [postId] = useState(() => Crypto.randomUUID());

  const [pickedCoord, setPickedCoord] = useState<PickedCoord | null>(null);
  const [countryMatch, setCountryMatch] = useState<CountryMatch | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [placeLabel, setPlaceLabel] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);

  function handleCoordPicked(lng: number, lat: number) {
    setLocationError(null);
    setPickedCoord({ lng, lat });
    setCountryMatch(getCountryFromCoord(lng, lat));
  }

  function handleMapPress(event: NativeSyntheticEvent<PressEvent>) {
    const [lng, lat] = event.nativeEvent.lngLat;
    handleCoordPicked(lng, lat);
  }

  async function handleUseCurrentLocation() {
    setLocationError(null);
    setGpsLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
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
      if (lastKnown) {
        handleCoordPicked(lastKnown.coords.longitude, lastKnown.coords.latitude);
      }

      // 그다음 실제 측위로 핀을 정정한다. 이게 끝나야 게시가 열린다
      // (canPost가 gpsLoading을 보므로) — 캐시 좌표로 저장돼 서버의 시군구
      // 판정이 어긋나는 걸 막기 위함이다. 사용자 입장에서 "게시 가능해지는
      // 시점"은 예전과 같고, 핀과 지도만 먼저 움직인다.
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      handleCoordPicked(position.coords.longitude, position.coords.latitude);
    } catch (err) {
      console.error('[C-2-2b] 현재 위치 획득 실패:', err);
      setLocationError('현재 위치를 가져오지 못했어요. 지도에서 직접 선택해주세요.');
    } finally {
      setGpsLoading(false);
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
  // gpsLoading을 포함하는 이유: 현재 위치 버튼은 캐시 좌표로 핀을 먼저 찍고
  // 실제 측위로 정정한다. 그 사이에 저장되면 캐시 좌표가 그대로 남아 서버의
  // 시군구 판정이 어긋날 수 있다. (예전에도 측위가 끝나야 핀이 생겼으므로
  // 게시가 열리는 시점 자체는 늦어지지 않는다.)
  const canPost = !!pickedCoord && !!countryMatch && uploadingCount === 0 && !saving && !gpsLoading;

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
      router.dismissTo({ pathname: '/country/[cc]', params: { cc: countryMatch.cc, nm: countryMatch.nm } } as any);
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
              initialViewState={{ center: initialCenter ?? [127.5, 36], zoom: initialCenter ? 3 : 2 }}
            />
            <GeoJSONSource id="compose-countries" data={countriesGeoJSON as any}>
              <Layer id="compose-country-fill" type="fill" paint={{ 'fill-color': '#CDD2D8', 'fill-opacity': 1 }} />
              <Layer id="compose-country-border" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 0.8 }} />
            </GeoJSONSource>
            {pickedCoord && (
              // Marker 는 드래그를 지원하지 않아 ViewAnnotation 으로 바꿨다.
              // draggable 은 네이티브 구현이라 터치 핸들러를 직접 만들 필요가 없다.
              <ViewAnnotation
                id="compose-pin"
                lngLat={[pickedCoord.lng, pickedCoord.lat]}
                draggable
                onDragEnd={(e) => {
                  const [lng, lat] = e.nativeEvent.lngLat;
                  handleCoordPicked(lng, lat);
                }}
              >
                <View style={styles.pin} />
              </ViewAnnotation>
            )}
          </Map>

          <TouchableOpacity style={styles.gpsChip} onPress={handleUseCurrentLocation} disabled={gpsLoading}>
            {gpsLoading
              ? <ActivityIndicator size="small" color={theme.colors.accent} />
              : <Text style={styles.gpsChipText}>현재 위치</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 캐시 좌표로 핀을 먼저 찍은 상태 — 실제 측위가 끝나면 핀이 살짝
            움직일 수 있으므로 그 이유를 알려준다. */}
        {gpsLoading && pickedCoord && (
          <Text style={styles.hintText}>위치를 더 정확하게 맞추는 중…</Text>
        )}
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
  pin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
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
