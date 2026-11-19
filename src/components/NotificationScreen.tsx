import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from './ScreenHeader';
import { NotificationCard } from './NotificationCard';
import { Icons } from '../assets/icons';
import { interestTagIcon } from '../utils/tagIcon';
import type { NotificationItem } from './NotificationCard';
import {
  clearPocketHistory,
  getUnseenPocketHistory,
  isPocketNoticeSupported,
  markPocketSeenUntil,
  onPocketNotified,
  type PocketHistoryEntry,
} from '../services/pocketNotificationService';

type Props = {
  pocketNoticeEnabled: boolean;
  interestTags: string[];
  onOpenAR: () => void;
};

/** 「3分前」「2時間前」「昨日」のような書き方 */
const relativeTime = (unixSec: number) => {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 24 * 3600) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 48 * 3600) return '昨日';
  const date = new Date(unixSec * 1000);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

/** 通知の文言「近くに #散歩 の言葉があります」から、合った関心タグを取り出す */
const tagOf = (entry: PocketHistoryEntry) => entry.title.match(/#\S+/)?.[0] ?? null;

const toItem = (entry: PocketHistoryEntry): NotificationItem => ({
  id: `${entry.postId}-${entry.at}`,
  title: entry.title,
  body: entry.title,
  time: relativeTime(entry.at),
  tag: tagOf(entry) ?? '#言葉',
});

/** 関心タグの絵。自分で作ったタグなど絵の無いものはベル */
const iconOf = (entry: PocketHistoryEntry) => {
  const tag = tagOf(entry);
  return (tag && interestTagIcon(tag)) || Icons.notice;
};

/** 通知画面：届いたポケット通知の履歴（端末に保存されている） */
export function NotificationScreen({ pocketNoticeEnabled, interestTags, onOpenAR }: Props): React.JSX.Element {
  const [history, setHistory] = useState<PocketHistoryEntry[]>([]);

  // 画面に出した通知のうち、いちばん新しい時刻。画面を離れたらここまでを「見た」ことにする
  const latestShownAtRef = useRef(0);

  const reload = useCallback(() => {
    getUnseenPocketHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    latestShownAtRef.current = history.reduce((max, entry) => Math.max(max, entry.at), 0);
  }, [history]);

  useEffect(() => {
    reload();
    // 開いている間に届いた通知も足す
    const subscription = onPocketNotified((entry) => setHistory((prev) => [entry, ...prev]));
    const markSeen = () => {
      if (latestShownAtRef.current > 0) markPocketSeenUntil(latestShownAtRef.current);
    };
    // アプリを閉じたときも、見た通知は消す（次に開いたら新しい通知だけになる）
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        markSeen();
        setHistory([]);
      } else if (state === 'active') {
        reload();
      }
    });
    return () => {
      subscription?.remove();
      appStateSub.remove();
      markSeen();
    };
  }, [reload]);

  const handleClear = () => {
    if (history.length === 0) return;
    Alert.alert('通知の履歴を消す', 'これまでのポケット通知の履歴を消しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '消す',
        style: 'destructive',
        onPress: () => {
          clearPocketHistory();
          setHistory([]);
        },
      },
    ]);
  };

  const noticeTitle = !isPocketNoticeSupported
    ? 'ポケット通知はこの端末では使えません'
    : !pocketNoticeEnabled
      ? 'ポケット通知はオフです'
      : interestTags.length === 0
        ? '関心タグが設定されていません'
        : 'ポケット通知がオンになっています';
  const noticeDesc =
    pocketNoticeEnabled && interestTags.length > 0
      ? `${interestTags.join(' ')} の言葉の近くに来たとき、通知が届きます。アプリを開いたあと、ポケットに入れていても届きます。`
      : 'マイページの「関心タグ」で、通知を受け取るタグとオン・オフを設定できます。';

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="通知"
        rightAction={
          <TouchableOpacity style={styles.clearBtn} activeOpacity={0.7} onPress={handleClear}>
            <Text style={styles.clearBtnText}>履歴を消す</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.calmNoticeBox}>
          <Image source={Icons.notice} style={styles.calmIcon} resizeMode="contain" />
          <View style={styles.calmTextGroup}>
            <Text style={styles.calmTitle}>{noticeTitle}</Text>
            <Text style={styles.calmDesc}>{noticeDesc}</Text>
          </View>
        </View>


        {history.length === 0 ? (
          <Text style={styles.emptyText}>新しい通知はありません</Text>
        ) : (
          <>
            {history.map((entry) => (
              <NotificationCard
                key={`${entry.postId}-${entry.at}`}
                item={toItem(entry)}
                icon={iconOf(entry)}
                onPress={onOpenAR}
              />
            ))}
            <Text style={styles.seenHintText}>見た通知は、この画面を離れると消えます</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  clearBtn: {
    width: 72,
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  clearBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  calmNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 6,
  },
  calmIcon: {
    width: 22,
    height: 24,
    marginRight: 10,
    marginTop: 2,
    tintColor: '#059669',
  },
  calmTextGroup: {
    flex: 1,
  },
  calmTitle: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  calmDesc: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 16,
  },
  seenHintText: {
    marginTop: 4,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
  },
  emptyText: {
    marginTop: 24,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 13,
  },
});
