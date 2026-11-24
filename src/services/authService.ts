import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { deleteMyPost } from './postService';

/**
 * 新規登録 (Email & Password)
 */
/**
 * みんなに見える名前（言葉の置き主）。新規登録で決めたニックネーム。
 * 無いとき（ログインしていない・古いアカウント）は「ゲスト」。メールアドレスの一部は、人に見えるので使わない
 */
export const displayNameOf = (user: User | null | undefined): string => {
  const name = user?.user_metadata?.username;
  return typeof name === 'string' && name.trim() ? name.trim() : 'ゲスト';
};

export const signUpWithEmail = async (email: string, password: string, username: string) => {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        // メールアドレスの一部を名前にすると人に見えてしまうので、必ず入力されたニックネームを使う
        username: username.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

/**
 * ログイン (Email & Password)
 */
export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

/**
 * ログアウト
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

/**
 * アカウントを削除する（元に戻せない）。
 * 1. 自分の投稿をひとつずつ消す（地図・景色の写真のファイルも。Storage の削除は「投稿の持ち主か」で判定するので、投稿が残っているうちに）
 * 2. サーバーの delete_my_account() で、残った投稿とログインのアカウントを消す（拾った記録も一緒に消える）
 * 3. 端末のログイン情報を消す
 * SQL は supabase/migrations/20261120000000_delete_account.sql
 */
export const deleteMyAccount = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) {
    throw new Error('ログインしていません');
  }

  const { data: posts, error: listError } = await supabase.from('posts').select('id').eq('user_id', userId);
  if (listError) {
    throw new Error(`自分の投稿を取得できませんでした: ${listError.message}`);
  }
  for (const post of posts ?? []) {
    try {
      await deleteMyPost(String(post.id));
    } catch (err) {
      // ファイルや投稿が消せなくても、最後の関数が残った投稿を消す
      console.warn('投稿の削除に失敗しました（続けます）:', err);
    }
  }

  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    throw new Error(`アカウントを削除できませんでした: ${error.message}`);
  }
  // サーバーではもう消えているので、端末のログイン情報だけ消す
  await supabase.auth.signOut({ scope: 'local' });
};
