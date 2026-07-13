import { GoogleSignin } from '@react-native-google-signin/google-signin';

// webClientId는 Android 클라이언트 ID가 아니라 Web 클라이언트 ID여야 idToken이 발급된다.
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
});
