import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { uuid } from 'expo-modules-core';
import { theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';

const MAX_PHOTOS = 10;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

type UploadStatus = 'resizing' | 'uploading' | 'done' | 'error';

type UploadItem = {
  name: string;
  status: UploadStatus;
  path?: string;
  error?: string;
};

function statusLabel(status: UploadStatus) {
  switch (status) {
    case 'resizing': return '리사이즈 중…';
    case 'uploading': return '업로드 중…';
    case 'done': return '성공';
    case 'error': return '실패';
  }
}

// TODO(C-2-3): 정식 작성 폼(캡션/공개범위/위치 선택 + posts/post_media 저장)으로 교체.
// 지금은 사진 선택 → 리사이즈 → post-media 업로드 파이프라인 검증용 임시 화면.
export default function ComposeScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function handlePickAndUpload() {
    const userId = session?.user.id;
    if (!userId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('권한 필요', '사진 접근 권한을 허용해주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
    });
    if (result.canceled || result.assets.length === 0) return;

    const assets = result.assets.slice(0, MAX_PHOTOS);
    // C-2-3에서 실제 posts.id로 그대로 재사용 예정 — 그러면 파일 이동 없이 연결됨.
    const tempPostId = uuid.v4();
    console.log('[C-2-1b] batch start — tempPostId=', tempPostId, 'userId=', userId);

    setBusy(true);
    setItems(assets.map((_, i) => ({ name: `photo-${i}.jpg`, status: 'resizing' })));

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const name = `photo-${i}.jpg`;
      const path = `posts/${userId}/${tempPostId}/${name}`;

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

        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'uploading' } : it)));

        const { error } = await supabase.storage
          .from('post-media')
          .upload(path, decode(resized.base64), { contentType: 'image/jpeg' });
        if (error) throw error;

        // 정책 검증용: 본인 폴더(posts/{userId}/...) 아래로 올라가는지 확인
        console.log('[C-2-1b] uploaded ->', path);
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'done', path } : it)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[C-2-1b] 업로드 실패:', path, message);
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: message } : it)));
      }
    }

    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>사진 업로드 테스트</Text>
        <Text style={styles.subtitle}>C-2-1b — 선택 → 리사이즈 → 업로드까지만. DB 저장은 다음 단계(C-2-3).</Text>

        <TouchableOpacity style={styles.pickBtn} onPress={handlePickAndUpload} disabled={busy}>
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.pickBtnText}>사진 선택 (최대 {MAX_PHOTOS}장)</Text>
          }
        </TouchableOpacity>

        <View style={styles.list}>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={[styles.itemStatus, item.status === 'error' && styles.itemStatusError]}>
                {statusLabel(item.status)}
              </Text>
              {item.path && <Text style={styles.itemPath}>{item.path}</Text>}
              {item.error && <Text style={styles.itemPath}>{item.error}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  pickBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  itemRow: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    padding: 12,
    gap: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemStatus: {
    fontSize: 13,
    color: theme.colors.accent,
  },
  itemStatusError: {
    color: '#dc2626',
  },
  itemPath: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
});
