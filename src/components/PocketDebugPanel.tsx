import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPocketStatus, resetPocketNotified, type PocketStatus } from '../services/pocketNotificationService';

const meters = (value: number | undefined) => (value == null ? '—' : `${Math.round(value)}m`);
const seconds = (value: number | undefined) => (value == null ? '—' : `${Math.round(value)}秒前`);

/**
 * 開発用：ポケット通知の見張りの状態（通知画面に出す）。通知が届かない理由を切り分けるのに使う
 */
export function PocketDebugPanel(): React.JSX.Element {
  const [status, setStatus] = useState<PocketStatus | null>(null);

  useEffect(() => {
    const load = () =>
      getPocketStatus()
        .then(setStatus)
        .catch(() => {});
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  const rows: [string, string][] = status
    ? [
        ['通知の許可', status.permission],
        ['見張り', status.running ? '動いている' : '止まっている'],
        ['対象のメッセージ', `${status.targetCount} 件`],
        ['いちばん近い対象', `${meters(status.nearestDistanceM)}（範囲 ${meters(status.radiusM)}）`],
        ['GPS の誤差', `${meters(status.accuracyM)}（上限 ${meters(status.maxAccuracyM)}）・${seconds(status.locationAgeSec)}`],
        ['通知どうしの間隔', status.cooldownLeftSec > 0 ? `あと ${Math.round(status.cooldownLeftSec)}秒` : 'なし'],
        ['通知済みのメッセージ', `${status.notifiedCount} 件`],
        ['直近の判定', `${status.lastCheckResult}（${seconds(status.lastCheckAgeSec)}）`],
      ]
    : [['状態', '取得できません']];

  return (
    <View style={styles.box}>
      <Text style={styles.title}>ポケット通知の状態（開発用）</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.button} activeOpacity={0.7} onPress={resetPocketNotified}>
        <Text style={styles.buttonText}>通知した記録をリセット</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  title: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    width: 120,
    color: '#64748B',
    fontSize: 11,
  },
  value: {
    flex: 1,
    color: '#0F172A',
    fontSize: 11,
  },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  buttonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
});
