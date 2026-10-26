import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://jfywongowihracxeucue.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Z5SR36_9QAvQCs6tN9iH4w_TFpFnSPs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// アプリが前に出ている間だけトークンを自動で更新する（React Native で Supabase を使うときの推奨）。
// 裏に回っている間は更新タイマーが止まるので、前に出たときに期限切れのトークンをすぐ取り直す
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
