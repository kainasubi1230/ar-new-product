import React, { useEffect, useRef, useState } from 'react';
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

const { width } = Dimensions.get('window');

export type WordSpot = {
  id: string;
  category: string;
  author: string;
  handle: string;
  distanceMeter: number;
  directionDeg: number; // 0 = 北, 90 = 東, etc
  snippet: string;
  locationHint: string;
  xPercent: number; // 20 - 80% on map canvas
  yPercent: number;
};

const SAMPLE_SPOTS: WordSpot[] = [
  {
    id: 'spot-1',
    category: 'カフェ・席',
    author: 'Ken',
    handle: '@ken_loca',
    distanceMeter: 24,
    directionDeg: 35,
    snippet: '奥の窓際席、日当たり良くて作業が捗るよ',
    locationHint: '窓際カウンター席の右端',
    xPercent: 68,
    yPercent: 32,
  },
  {
    id: 'spot-2',
    category: '室内',
    author: 'Ken',
    handle: '@ken_loca',
    distanceMeter: 5,
    directionDeg: -20,
    snippet: 'テスト2',
    locationHint: '手前の木製デスク上',
    xPercent: 44,
    yPercent: 54,
  },
  {
    id: 'spot-3',
    category: '公園・ベンチ',
    author: 'Yuki',
    handle: '@yuki_walk',
    distanceMeter: 68,
    directionDeg: 130,
    snippet: '夕方ここから見える木漏れ日が綺麗です',
    locationHint: '大きな桜の木の下のベンチ',
    xPercent: 78,
    yPercent: 78,
  },
  {
    id: 'spot-4',
    category: '路地・通り',
    author: 'Taro',
    handle: '@taro_street',
    distanceMeter: 110,
    directionDeg: -80,
    snippet: 'この小道、夜になると行灯が灯る',
    locationHint: '石畳の角にある灯籠のそば',
    xPercent: 22,
    yPercent: 42,
  },
];

const TAG_FILTERS = ['すべて', 'カフェ・席', '室内', '公園・ベンチ', '路地・通り', '広場・景観'];

type Props = {
  onOpenARLens: () => void;
};

export function CityWordsMapScreen({ onOpenARLens }: Props): React.JSX.Element {
  const [selectedTag, setSelectedTag] = useState<string>('すべて');
  const [selectedSpot, setSelectedSpot] = useState<WordSpot>(SAMPLE_SPOTS[1]);

  // ふわふわ浮かぶ矢印のアニメーション
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 矢印の上下フロートアニメーション
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 現在地パルスアニメーション
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim, pulseAnim]);

  const filteredSpots = SAMPLE_SPOTS.filter(
    (spot) => selectedTag === 'すべて' || spot.category === selectedTag
  );

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.appLogo}>Loca</Text>
          <View style={styles.spotCountBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.spotCountText}>周辺に {filteredSpots.length} つの言葉</Text>
          </View>
        </View>

        {/* Tag Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {TAG_FILTERS.map((tag) => {
            const isSelected = tag === selectedTag;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedTag(tag)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Floating Arrow Radar Banner */}
      <View style={styles.radarBannerContainer}>
        <Animated.View
          style={[
            styles.radarBanner,
            {
              transform: [{ translateY: floatAnim }],
            },
          ]}
        >
          <View style={styles.arrowIconCircle}>
            <Text
              style={[
                styles.arrowIcon,
                { transform: [{ rotate: `${selectedSpot.directionDeg}deg` }] },
              ]}
            >
              ↑
            </Text>
          </View>
          <View style={styles.radarTextGroup}>
            <Text style={styles.radarTargetTitle}>
              「{selectedSpot.category}」の方角
            </Text>
            <Text style={styles.radarDistanceText}>
              約 {selectedSpot.distanceMeter}m 先 • {selectedSpot.locationHint}
            </Text>
          </View>
          <View style={styles.radarLiveBadge}>
            <Text style={styles.radarLiveText}>誘導中</Text>
          </View>
        </Animated.View>
      </View>

      {/* Map Radar Canvas */}
      <View style={styles.mapCanvas}>
        {/* Radar concentric rings */}
        <View style={[styles.radarRing, styles.ringOuter]} />
        <View style={[styles.radarRing, styles.ringMid]} />
        <View style={[styles.radarRing, styles.ringInner]} />

        {/* Grid coordinates lines */}
        <View style={styles.gridLineHorizontal} />
        <View style={styles.gridLineVertical} />

        {/* Ring distance labels */}
        <Text style={styles.ringLabelOuter}>100m</Text>
        <Text style={styles.ringLabelMid}>50m</Text>
        <Text style={styles.ringLabelInner}>20m</Text>

        {/* Current user location dot */}
        <View style={styles.userLocationContainer}>
          <Animated.View
            style={[
              styles.userPulseRing,
              {
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim.interpolate({
                  inputRange: [1, 1.4],
                  outputRange: [0.6, 0],
                }),
              },
            ]}
          />
          <View style={styles.userLocationDot} />
          {/* View field cone */}
          <View style={styles.viewCone} />
        </View>

        {/* Word Spots plotted on map */}
        {filteredSpots.map((spot) => {
          const isSelected = spot.id === selectedSpot.id;
          return (
            <TouchableOpacity
              key={spot.id}
              style={[
                styles.spotPinContainer,
                {
                  left: `${spot.xPercent}%`,
                  top: `${spot.yPercent}%`,
                },
              ]}
              onPress={() => setSelectedSpot(spot)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.spotPinBubble,
                  isSelected ? styles.spotPinBubbleActive : styles.spotPinBubbleInactive,
                ]}
              >
                <Text style={styles.spotPinIcon}>💬</Text>
                <Text
                  style={[
                    styles.spotPinCategory,
                    isSelected && styles.spotPinCategoryActive,
                  ]}
                  numberOfLines={1}
                >
                  {spot.category}
                </Text>
              </View>
              <View style={[styles.spotPinStem, isSelected && styles.spotPinStemActive]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Target Word Preview Bottom Card */}
      <View style={styles.bottomCardContainer}>
        <View style={styles.bottomCard}>
          <View style={styles.bottomCardHeader}>
            <View style={styles.authorGroup}>
              <Text style={styles.authorName}>{selectedSpot.author}</Text>
              <Text style={styles.authorHandle}>{selectedSpot.handle}</Text>
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>{selectedSpot.category}</Text>
              </View>
            </View>
            <Text style={styles.distanceBadge}>{selectedSpot.distanceMeter}m</Text>
          </View>

          {/* Snippet */}
          <Text style={styles.snippetText} numberOfLines={2}>
            「{selectedSpot.snippet}」
          </Text>

          <View style={styles.hintRow}>
            <Text style={styles.hintIcon}>📍</Text>
            <Text style={styles.hintText}>{selectedSpot.locationHint}</Text>
          </View>

          {/* Action to switch to AR Lens */}
          <TouchableOpacity
            style={styles.openARButton}
            activeOpacity={0.85}
            onPress={onOpenARLens}
          >
            <Text style={styles.openARButtonText}>現地に着いたら AR Lens で見る</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A12',
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#0A0E1A',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  appLogo: {
    color: '#0090EA',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spotCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 56, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00E676',
    marginRight: 6,
  },
  spotCountText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(23, 33, 56, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: '#0090EA',
    borderColor: '#0090EA',
  },
  filterChipText: {
    color: '#8E9EB8',
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Floating Arrow Radar Banner
  radarBannerContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 10,
  },
  radarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 42, 0.9)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 163, 255, 0.45)',
    shadowColor: '#0090EA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  arrowIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0090EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  arrowIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  radarTextGroup: {
    flex: 1,
  },
  radarTargetTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  radarDistanceText: {
    color: '#8FA3C2',
    fontSize: 11,
    marginTop: 2,
  },
  radarLiveBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00E676',
  },
  radarLiveText: {
    color: '#00E676',
    fontSize: 11,
    fontWeight: '700',
  },

  // Map Radar Canvas
  mapCanvas: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 24,
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(41, 182, 246, 0.18)',
    borderStyle: 'dashed',
  },
  ringOuter: {
    width: width * 0.85,
    height: width * 0.85,
  },
  ringMid: {
    width: width * 0.55,
    height: width * 0.55,
  },
  ringInner: {
    width: width * 0.28,
    height: width * 0.28,
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  ringLabelOuter: {
    position: 'absolute',
    top: 14,
    color: 'rgba(142, 163, 194, 0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
  ringLabelMid: {
    position: 'absolute',
    top: 60,
    color: 'rgba(142, 163, 194, 0.5)',
    fontSize: 10,
    fontWeight: '600',
  },
  ringLabelInner: {
    position: 'absolute',
    top: 104,
    color: 'rgba(142, 163, 194, 0.5)',
    fontSize: 10,
    fontWeight: '600',
  },

  // User location marker
  userLocationContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userLocationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00A3FF',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    zIndex: 2,
  },
  userPulseRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 163, 255, 0.35)',
  },
  viewCone: {
    position: 'absolute',
    top: -24,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderBottomWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(0, 163, 255, 0.18)',
    transform: [{ rotate: '180deg' }],
  },

  // Spot Pin on Map
  spotPinContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  spotPinBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  spotPinBubbleActive: {
    backgroundColor: '#008CE3',
    borderColor: '#FFFFFF',
  },
  spotPinBubbleInactive: {
    backgroundColor: 'rgba(19, 27, 46, 0.92)',
    borderColor: 'rgba(0, 163, 255, 0.4)',
  },
  spotPinIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  spotPinCategory: {
    color: '#8CA0BF',
    fontSize: 11,
    fontWeight: '700',
  },
  spotPinCategoryActive: {
    color: '#FFFFFF',
  },
  spotPinStem: {
    width: 2,
    height: 6,
    backgroundColor: 'rgba(0, 163, 255, 0.4)',
  },
  spotPinStemActive: {
    backgroundColor: '#FFFFFF',
  },

  // Bottom Target Card
  bottomCardContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bottomCard: {
    backgroundColor: 'rgba(16, 23, 40, 0.95)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(41, 182, 246, 0.35)',
  },
  bottomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  authorHandle: {
    color: '#8496B2',
    fontSize: 12,
  },
  categoryPill: {
    backgroundColor: 'rgba(0, 144, 234, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0090EA',
  },
  categoryPillText: {
    color: '#0090EA',
    fontSize: 11,
    fontWeight: '700',
  },
  distanceBadge: {
    color: '#00E676',
    fontSize: 14,
    fontWeight: '800',
  },
  snippetText: {
    color: '#F0F4FF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  hintIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  hintText: {
    color: '#8E9EB8',
    fontSize: 12,
  },
  openARButton: {
    backgroundColor: '#008CE3',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#008CE3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  openARButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
