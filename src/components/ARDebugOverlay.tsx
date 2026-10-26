import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { ARDebugInfoEvent } from '../native/UniversalARView';

/** 照合の候補探しの結果（JS 側） */
export type RelocalizeSearchDebug = {
  /** 探した範囲（m） */
  radiusM: number;
  /** 範囲内の地図付き投稿の数 */
  candidates: number;
  /** そのうち「今のセッションで自分が置いた投稿」として除外した数 */
  excludedOwn: number;
  /** 照合に選んだ地図の投稿 ID */
  chosenPostId: string | null;
  /** 結果のひとこと */
  note: string;
};

type Props = {
  gps: {
    /** 方角タグなどに使っている位置の誤差（m） */
    accuracyM: number | null;
    isApproximate: boolean | null;
    /** 直近に届いた GPS の生の誤差（m） */
    rawAccuracyM: number | null;
  };
  /** 照合を止めている理由（空なら止めていない） */
  blockReasons: string[];
  search: RelocalizeSearchDebug | null;
  native: ARDebugInfoEvent | null;
};

const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : '-');
const seconds = (t: number | null | undefined) => (t == null ? '-' : `+${t.toFixed(1)}s`);
const meters = (m: number | null | undefined) => (m == null ? '-' : `${Math.round(m)}m`);

/** AR 画面の端に出す、原因の切り分け用の小さな表示 */
export function ARDebugOverlay({ gps, blockReasons, search, native }: Props): React.JSX.Element {
  const lines = [
    `GPS 使用:${meters(gps.accuracyM)} 生:${meters(gps.rawAccuracyM)} ${
      gps.isApproximate == null ? '位置なし' : gps.isApproximate ? 'おおよそ' : '確定'
    }`,
    `照合候補: 範囲${meters(search?.radiusM)} 候補${search?.candidates ?? '-'} 自分除外${
      search?.excludedOwn ?? '-'
    } 選択${short(search?.chosenPostId)}`,
    `  ${search?.note ?? '未検索'}`,
    `照合停止: ${blockReasons.length > 0 ? blockReasons.join(' / ') : 'なし'}`,
  ];

  if (native) {
    lines.push(
      `track:${native.trackingState} map:${native.worldMappingStatus}`,
      `照合:${native.relocalizationPhase} 地図付き:${native.isRunningWithWorldMap ? 'yes' : 'no'} 経過${seconds(
        native.elapsed
      )}`,
      `地図:${short(native.loadedMapPostId)} アンカー[${native.mapAnchorPostIds.map(short).join(', ')}]`,
      `normal到達:${seconds(native.trackingNormalAt)}`,
      `didAdd:${
        native.anchorArrivals.length > 0
          ? native.anchorArrivals.map((a) => `${short(a.postId)}${seconds(a.t)}`).join(', ')
          : '-'
      }`,
      `found:[${native.foundPostIds.map(short).join(', ')}] 北:${native.northReady ? 'ok' : '未'} 方位誤差:${
        native.headingAccuracy < 0 ? '無効' : `${Math.round(native.headingAccuracy)}°`
      }`,
      `遮蔽: LiDAR:${native.lidar ? 'あり' : 'なし'} 平面 縦${native.planes.filter((p) => p === '縦').length} 横${
        native.planes.filter((p) => p === '横').length
      }`,
      ...native.revealCards.map(
        (card) =>
          `  ${short(card.postId)} ${card.distance.toFixed(1)}m ${card.occluded ? '隠す' : '見せる'}(${card.reason}) 表示${Math.round(
            card.reveal * 100
          )}%`
      )
    );
  } else {
    lines.push('ネイティブ: 未受信');
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {lines.map((line, index) => (
        <Text key={index} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '78%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 50,
  },
  line: {
    color: '#E2E8F0',
    fontSize: 9.5,
    lineHeight: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
