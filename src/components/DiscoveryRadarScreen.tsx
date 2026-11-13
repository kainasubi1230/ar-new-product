import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenHeader } from './ScreenHeader';
import { NotificationCard } from './NotificationCard';
import { NOTIFICATIONS, NotificationItem } from '../data/notifications';
import {
  DEFAULT_FILTER_SETTINGS,
  FilterSettings,
  filterPostsByCriteria,
  normalizeTag,
} from '../services/interestTagService';
import { fetchNearbyPosts } from '../services/worldMapService';

const { width } = Dimensions.get('window');

type RadarSpot = NotificationItem & {
  message: string;
  tags: string[];
  topPercent: number;
  leftPercent: number;
};

const FALLBACK_RADAR_SPOTS: RadarSpot[] = [
  {
    id: 'r1',
    title: '近くに関心タグのメッセージ',
    body: '近くに「#カフェ」のメッセージがあります：「ここの席、午後の光が最高。」',
    message: 'ここの席、午後の光が最高。',
    time: '2分前',
    tag: '#カフェ',
    tags: ['#カフェ', '#日常'],
    distance: '45 m',
    topPercent: 28,
    leftPercent: 34,
  },
  {
    id: 'r2',
    title: '街歩きの発見',
    body: '「#散歩」警固公園のベンチ近くに新しい言葉があります',
    message: '夕暮れの風が心地よくて、散歩の休憩にぴったりなベンチ。',
    time: '12分前',
    tag: '#散歩',
    tags: ['#散歩', '#自然'],
    distance: '120 m',
    topPercent: 64,
    leftPercent: 70,
  },
  {
    id: 'r3',
    title: '読書のしおり',
    body: '「#本」静かな窓際席に残された言葉があります',
    message: '雨の日にここで小説を読む時間が好き 📚',
    time: '25分前',
    tag: '#本',
    tags: ['#本', '#カフェ'],
    distance: '180 m',
    topPercent: 38,
    leftPercent: 76,
  },
  {
    id: 'r4',
    title: '路地裏のグルメ記録',
    body: '「#グルメ」薬院エリアで新しいおすすめの一皿が投稿されました',
    message: '路地裏のスパイスカレー、香りだけで元気が出る 🍛',
    time: '40分前',
    tag: '#グルメ',
    tags: ['#グルメ', '#カレー', '#ランチ'],
    distance: '240 m',
    topPercent: 72,
    leftPercent: 30,
  },
  {
    id: 'r5',
    title: '街の記憶・歴史',
    body: '「#歴史」古い石碑の近くに言葉が残されています',
    message: '明治時代から残る煉瓦造りの建物、夕日に照らされると綺麗。',
    time: '1時間前',
    tag: '#歴史',
    tags: ['#歴史', '#思い出', '#街歩き'],
    distance: '310 m',
    topPercent: 22,
    leftPercent: 60,
  },
];

type Props = {
  onBack: () => void;
  onStartNavigation: (tag?: string) => void;
  interestTags?: string[];
  filterSettings?: FilterSettings;
  activeFilterTag?: string | null;
  onSelectFilterTag?: (tag: string | null) => void;
  onOpenTagManage?: () => void;
};

export function DiscoveryRadarScreen({
  onStartNavigation,
  interestTags = ['#散歩', '#カフェ', '#日常', '#本'],
  filterSettings = DEFAULT_FILTER_SETTINGS,
  activeFilterTag = null,
  onSelectFilterTag,
  onOpenTagManage,
}: Props): React.JSX.Element {
  const [localFilterTag, setLocalFilterTag] = useState<string | null>(
    activeFilterTag ?? (filterSettings.onlyInterestTags ? '__INTEREST__' : null)
  );
  const [remoteSpots, setRemoteSpots] = useState<RadarSpot[]>([]);
  const [selectedSpotIndex, setSelectedSpotIndex] = useState<number>(0);

  const effectiveFilterTag = onSelectFilterTag ? activeFilterTag ?? null : localFilterTag;
  const handleSelectTag = (tag: string | null) => {
    setSelectedSpotIndex(0);
    if (onSelectFilterTag) {
      onSelectFilterTag(tag);
    } else {
      setLocalFilterTag(tag);
    }
  };

  // アニメーション: レーダー回転スキャン ＆ 矢印の浮遊
  const radarScanAnim = useRef(new Animated.Value(0)).current;
  const arrowFloatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const posts = await fetchNearbyPosts(null, 1000);
        if (cancelled || posts.length === 0) return;
        const mapped: RadarSpot[] = posts.slice(0, 8).map((p, idx) => {
          const primaryTag = normalizeTag(p.tags?.[0] ?? '#日常') || '#日常';
          const msg = p.message ?? 'ここに言葉が残されています';
          return {
            id: `post-${p.id}`,
            title: `${p.author ?? '誰か'}さんの残した言葉`,
            body: `「${primaryTag}」${msg}`,
            message: msg,
            time: new Date(p.created_at).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            tag: primaryTag,
            tags: p.tags && p.tags.length > 0 ? p.tags.map(normalizeTag) : [primaryTag],
            distance: `${p.distanceM} m`,
            topPercent: 22 + ((idx * 19) % 56),
            leftPercent: 24 + ((idx * 23) % 54),
          };
        });
        setRemoteSpots(mapped);
      } catch (_e) {
        // オフライン・取得失敗時はフォールバックを使用
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(radarScanAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowFloatAnim, {
          toValue: -8,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(arrowFloatAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [radarScanAnim, arrowFloatAnim, pulseAnim]);

  const allSpots = useMemo(() => {
    return remoteSpots.length > 0 ? [...remoteSpots, ...FALLBACK_RADAR_SPOTS] : FALLBACK_RADAR_SPOTS;
  }, [remoteSpots]);

  const filteredSpots = useMemo(() => {
    return filterPostsByCriteria(allSpots, {
      activeFilterTag: effectiveFilterTag,
      interestTags,
      onlyInterestTags: filterSettings.onlyInterestTags,
      hideNegativePosts: filterSettings.hideNegativePosts,
    });
  }, [allSpots, effectiveFilterTag, interestTags, filterSettings]);

  const activeSpot =
    filteredSpots[selectedSpotIndex % Math.max(1, filteredSpots.length)] ?? NOTIFICATIONS[0];

  const spin = radarScanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Top Section (Header + Filter Bar + Selected Spot Card) */}
      <View style={styles.topSection}>
        <ScreenHeader
          title="探索"
          rightAction={
            onOpenTagManage ? (
              <TouchableOpacity
                style={styles.filterConfigBtn}
                onPress={onOpenTagManage}
                activeOpacity={0.7}
              >
                <Text style={styles.filterConfigBtnText}>タグ設定</Text>
              </TouchableOpacity>
            ) : undefined
          }
        />

        {/* Horizontal Filter Chip Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
          style={styles.filterBar}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              (!effectiveFilterTag || effectiveFilterTag === 'ALL') && styles.filterChipActive,
            ]}
            onPress={() => handleSelectTag('ALL')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                (!effectiveFilterTag || effectiveFilterTag === 'ALL') && styles.filterChipTextActive,
              ]}
            >
              すべて
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterChip,
              effectiveFilterTag === '__INTEREST__' && styles.filterChipActive,
            ]}
            onPress={() => handleSelectTag('__INTEREST__')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                effectiveFilterTag === '__INTEREST__' && styles.filterChipTextActive,
              ]}
            >
              ★ 関心タグ ({interestTags.length})
            </Text>
          </TouchableOpacity>

          {interestTags.map((rawTag) => {
            const tag = normalizeTag(rawTag);
            const isSelected = effectiveFilterTag === tag;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => handleSelectTag(isSelected ? 'ALL' : tag)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.topCardWrapper}>
          {filteredSpots.length > 0 ? (
            <NotificationCard
              item={activeSpot}
              onPress={() => onStartNavigation(activeSpot.tag)}
            />
          ) : (
            <View style={styles.emptySpotCard}>
              <Text style={styles.emptySpotTitle}>
                選択中のタグに一致する言葉が近くにありません
              </Text>
              <Text style={styles.emptySpotSub}>
                フィルターを「すべて」に切り替えるか、別の関心タグを選択してみてください。
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Center Radar Canvas */}
      <View style={styles.radarWrapper}>
        <View style={styles.radarCircle}>
          {/* Concentric Circles */}
          <View style={[styles.concentricRing, styles.ring3]} />
          <View style={[styles.concentricRing, styles.ring2]} />
          <View style={[styles.concentricRing, styles.ring1]} />

          {/* Cross lines */}
          <View style={styles.crossLineH} />
          <View style={styles.crossLineV} />

          {/* Rotating Scan Sweep Beam */}
          <Animated.View style={[styles.scanBeam, { transform: [{ rotate: spin }] }]} />

          {/* Nearby Filtered Spot Dots */}
          {filteredSpots.map((spot, idx) => {
            const isFocused = idx === selectedSpotIndex % Math.max(1, filteredSpots.length);
            return (
              <TouchableOpacity
                key={spot.id}
                style={[
                  styles.radarDot,
                  isFocused && styles.radarDotActive,
                  { top: `${spot.topPercent}%`, left: `${spot.leftPercent}%` },
                ]}
                onPress={() => setSelectedSpotIndex(idx)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              />
            );
          })}

          {/* Center 3D Compass Arrow pointing toward target */}
          <Animated.View
            style={[
              styles.centerArrowContainer,
              { transform: [{ translateY: arrowFloatAnim }] },
            ]}
          >
            <View style={styles.arrowHead3D}>
              <Text style={styles.arrowSymbol}>▲</Text>
            </View>
          </Animated.View>
        </View>

        <Text style={styles.radarStatusText}>
          🔍 周囲で {filteredSpots.length} 件の言葉を検知中
          {filteredSpots.length > 1 ? '（ドットをタップで切替）' : ''}
        </Text>
      </View>

      {/* Bottom Navigation CTA */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.navButton}
          activeOpacity={0.85}
          onPress={() => onStartNavigation(activeSpot?.tag)}
        >
          <Text style={styles.navButtonText}>
            {activeSpot?.tag ? `${activeSpot.tag} のARナビを開始` : 'ナビを開始'}
          </Text>
          <Text style={styles.navButtonArrow}>↗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'space-between',
  },
  topSection: {
    width: '100%',
  },
  filterConfigBtn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  filterConfigBtnText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    maxHeight: 46,
    marginTop: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topCardWrapper: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  emptySpotCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  emptySpotTitle: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySpotSub: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Center Radar
  radarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  radarCircle: {
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: (width * 0.72) / 2,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#34D399',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  concentricRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  ring1: {
    width: '32%',
    height: '32%',
  },
  ring2: {
    width: '62%',
    height: '62%',
  },
  ring3: {
    width: '90%',
    height: '90%',
  },
  crossLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  crossLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  scanBeam: {
    position: 'absolute',
    width: '50%',
    height: 2,
    right: 0,
    top: '50%',
    backgroundColor: '#10B981',
    transformOrigin: 'left center',
  },
  radarDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  radarDotActive: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    borderColor: '#FEF08A',
    borderWidth: 2.5,
  },
  centerArrowContainer: {
    zIndex: 10,
  },
  arrowHead3D: {
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  arrowSymbol: {
    color: '#059669',
    fontSize: 50,
    textShadowColor: 'rgba(16, 185, 129, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  radarStatusText: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },

  // Bottom Section
  bottomSection: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  navButton: {
    backgroundColor: '#10B981',
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  navButtonArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
