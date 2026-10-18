import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

/**
 * 新規登録 (Email & Password)
 */
export const signUpWithEmail = async (email: string, password: string, username?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        username: username?.trim() || email.split('@')[0],
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
 * 現在のログインユーザーとセッションを取得
 */
export const getCurrentSession = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};
