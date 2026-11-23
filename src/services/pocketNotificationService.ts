import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { POCKET_NOTICE } from '../config/pocketNotice';

/** ネイティブに渡す、通知の対象のメッセージ */
type PocketTarget = {
  postId: string;
  latitude: number;
  longitude: number;
  title: string;
  body: string;
};

/** 届いたポケット通知の履歴（新しい順） */
export type PocketHistoryEntry = {
  postId: string;
  title: string;
  body: string;
  /** 通知した時刻（UNIX 秒） */
  at: number;
};

// iOS のみ（ネイティブの LocaPocket モジュール。ARViewWrapper.swift の末尾）
const LocaPocket = Platform.OS === 'ios' ? NativeModules.LocaPocket : undefined;
const emitter = LocaPocket ? new NativeEventEmitter(LocaPocket) : null;

export const isPocketNoticeSupported = LocaPocket != null;

export const requestNotificationPermission = async (): Promise<boolean> =>
  LocaPocket ? LocaPocket.requestPermission() : false;

/** 見張りを始める（ポケットの中でも位置を受け取り、radiusM 以内に入ったら通知する） */
export const startPocketNotice = (targets: PocketTarget[]) => {
  LocaPocket?.start(targets, {
    radiusM: POCKET_NOTICE.radiusM,
    cooldownSec: POCKET_NOTICE.cooldownSec,
    perPostIntervalSec: POCKET_NOTICE.perPostIntervalSec,
    maxAccuracyM: POCKET_NOTICE.maxAccuracyM,
  });
};

export const updatePocketTargets = (targets: PocketTarget[]) => LocaPocket?.updateTargets(targets);

export const stopPocketNotice = () => LocaPocket?.stop();

const getPocketHistory = async (): Promise<PocketHistoryEntry[]> =>
  LocaPocket ? LocaPocket.getHistory() : [];

// 通知画面で見た通知は、画面を離れたら消す。ネイティブの履歴はそのままにして、
// 「ここまで見た」時刻（UNIX 秒）を端末に覚えておき、それより前の通知を出さない
const SEEN_UNTIL_KEY = 'loca:pocketSeenUntil';

/** まだ見ていない通知の履歴（新しい順） */
export const getUnseenPocketHistory = async (): Promise<PocketHistoryEntry[]> => {
  const [history, seenRaw] = await Promise.all([
    getPocketHistory(),
    AsyncStorage.getItem(SEEN_UNTIL_KEY).catch(() => null),
  ]);
  const seenUntil = Number(seenRaw) || 0;
  return history.filter((entry) => entry.at > seenUntil);
};

/** at（UNIX 秒）までの通知を見たことにする */
export const markPocketSeenUntil = async (at: number) => {
  try {
    const current = Number(await AsyncStorage.getItem(SEEN_UNTIL_KEY)) || 0;
    if (at > current) await AsyncStorage.setItem(SEEN_UNTIL_KEY, String(at));
  } catch (error) {
    console.warn('[pocket] 見た通知の記録に失敗', error);
  }
};

/** ポケットの中でも届く位置（50m 動くごと）。対象のメッセージを取り直すのに使う */
export const onPocketLocation = (
  listener: (location: { latitude: number; longitude: number; accuracy: number }) => void
) => emitter?.addListener('pocketLocation', listener);

/** 通知を出した */
export const onPocketNotified = (listener: (entry: PocketHistoryEntry) => void) =>
  emitter?.addListener('pocketNotified', listener);

/** 通知がタップされた */
export const onNotificationOpened = (listener: (event: { postId: string }) => void) =>
  emitter?.addListener('notificationOpened', listener);
