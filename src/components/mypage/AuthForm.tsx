import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Icons } from '../../assets/icons';
import { ScreenHeader } from '../ScreenHeader';
import { signInWithEmail, signUpWithEmail } from '../../services/authService';
import { NICKNAME_MAX_LENGTH, checkNickname } from '../../services/safetyFilter';
import { styles } from './styles';

/** 未ログインのときのマイページ：ログイン・新規登録 */
export function AuthForm({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }): React.JSX.Element {
  // 未ログイン時の認証フォーム用ステート
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(initialMode);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // 確認メールを待っている間の入力。メールのリンクを開いてアプリに戻ってきたら、これで自動でログインする
  // （端末のメモリにだけ持ち、保存はしない）
  const pendingConfirmRef = useRef<{ email: string; password: string } | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const pending = pendingConfirmRef.current;
      if (state !== 'active' || !pending) return;
      signInWithEmail(pending.email, pending.password)
        .then(() => {
          // ログインできればマイページに切り替わる（このフォームは消える）
          pendingConfirmRef.current = null;
        })
        .catch((err) => {
          // まだリンクを開いていない（Email not confirmed）などは、黙って次に戻ってくるのを待つ
          console.log('確認後の自動ログインはまだできません:', err?.message);
        });
    });
    return () => sub.remove();
  }, []);

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('メールアドレスとパスワードを入力してください');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('パスワードは6文字以上で入力してください');
      return;
    }
    if (authMode === 'signup') {
      // ニックネームは言葉と一緒にみんなに見えるので、投稿と同じフィルターをかける
      const nicknameError = checkNickname(authUsername);
      if (nicknameError) {
        setAuthError(nicknameError);
        return;
      }
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        const result = await signUpWithEmail(authEmail, authPassword, authUsername);
        if (result.session) {
          Alert.alert('登録完了', 'アカウントを登録し、ログインしました！');
        } else {
          // リンクを開いたあとはブラウザに「サーバーに接続できません」と出ることがあるが、確認は済んでいる。
          // アプリに戻れば自動でログインし、だめでも「ログイン」のタブからそのまま入れるようにしておく
          pendingConfirmRef.current = { email: authEmail, password: authPassword };
          setAuthMode('signin');
          Alert.alert(
            '確認メールを送りました',
            '届いたメールの確認のリンク（Confirm …）を押したら、このアプリに戻ってください。自動でログインします。\n\nリンクを押したあと、ブラウザに「接続できません」と出ても確認は済んでいます。'
          );
        }
      } else {
        await signInWithEmail(authEmail, authPassword);
      }
    } catch (err: any) {
      let msg = err?.message || 'エラーが発生しました';
      if (msg.includes('Email not confirmed')) {
        msg = 'メールの確認がまだです。届いたメールのリンクを押してから、もう一度お試しください';
      } else if (msg.includes('Invalid login credentials')) {
        msg = 'メールアドレスまたはパスワードが正しくありません';
      } else if (msg.includes('User already registered')) {
        msg = 'このメールアドレスは既に登録されています。ログインをお試しください';
      } else if (msg.includes('Password should be at least')) {
        msg = 'パスワードは6文字以上で入力してください';
      } else if (msg.toLowerCase().includes('rate limit')) {
        msg = '短い時間に何度も試したため、少し待ってからもう一度お試しください';
      }
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

    return (
      <View style={styles.container}>
        <ScreenHeader title="マイページ" showTitleLogo={true} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.fullAuthContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.authHero}>
              <View style={styles.authHeroIconCircle}>
                <Image source={Icons.mypage} style={styles.authHeroIcon} resizeMode="contain" />
              </View>
              <Text style={styles.authHeroTitle}>
                {authMode === 'signin' ? 'マイページへログイン' : '新規アカウント作成'}
              </Text>
              <Text style={styles.authHeroSubtitle}>
                ログインすると、街に残した言葉や出会った記憶を保存・同期できます
              </Text>
            </View>

            {/* Tab Switcher */}
            <View style={styles.authTabSwitch}>
              <TouchableOpacity
                style={[styles.authTabBtn, authMode === 'signin' && styles.authTabBtnActive]}
                onPress={() => {
                  setAuthMode('signin');
                  setAuthError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.authTabText, authMode === 'signin' && styles.authTabTextActive]}>
                  ログイン
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authTabBtn, authMode === 'signup' && styles.authTabBtnActive]}
                onPress={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.authTabText, authMode === 'signup' && styles.authTabTextActive]}>
                  新規登録
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.authForm}>
              {authMode === 'signup' && (
                <View style={styles.authField}>
                  <Text style={styles.authFieldLabel}>ニックネーム</Text>
                  <TextInput
                    style={styles.authInput}
                    placeholder="例: sora"
                    placeholderTextColor="#94A3B8"
                    value={authUsername}
                    onChangeText={setAuthUsername}
                    autoCapitalize="none"
                    maxLength={NICKNAME_MAX_LENGTH}
                  />
                </View>
              )}

              <View style={styles.authField}>
                <Text style={styles.authFieldLabel}>メールアドレス</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="example@email.com"
                  placeholderTextColor="#94A3B8"
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.authField}>
                <Text style={styles.authFieldLabel}>パスワード（6文字以上）</Text>
                <TextInput
                  style={styles.authInput}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              {authError && (
                <View style={styles.authErrorCard}>
                  <Text style={styles.authErrorText}>{authError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.authSubmitBtn, authLoading && styles.authSubmitBtnDisabled]}
                onPress={handleAuthSubmit}
                disabled={authLoading}
                activeOpacity={0.85}
              >
                {authLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.authSubmitBtnText}>
                    {authMode === 'signin' ? 'ログインする' : '登録してはじめる'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
}
