import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { POCKET_NOTICE } from '../config/pocketNotice';

/** ネイティブに渡す、通知の対象のメッセージ */
export type PocketTarget = {
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

export const getPocketHistory = async (): Promise<PocketHistoryEntry[]> =>
  LocaPocket ? LocaPocket.getHistory() : [];

export const clearPocketHistory = () => LocaPocket?.clearHistory();

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
