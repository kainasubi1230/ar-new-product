import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

type Props = {
  onBack: () => void;
  onStartNavigation: () => void;
};

export function DiscoveryRadarScreen({ onBack, onStartNavigation }: Props): React.JSX.Element {
  // アニメーション: レーダー回転スキャン ＆ 矢印の浮遊
  const radarScanAnim = useRef(new Animated.Value(0)).current;
  const arrowFloatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // レーダースキャン回転
    Animated.loop(
      Animated.timing(radarScanAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 矢印の浮遊
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

    // パルス
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

  const spin = radarScanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>探索</Text>
      </View>

      {/* Top Alert Banner */}
      <View style={styles.alertBanner}>
        <View style={styles.alertIconCircle}>
          <Text style={styles.alertPin}>📍</Text>
        </View>
        <View style={styles.alertTextGroup}>
          <Text style={styles.alertTitle}>近くに</Text>
          <Text style={styles.alertSubtitle}>新しいメッセージがあります！</Text>
        </View>
        <Text style={styles.alertDistance}>120 m</Text>
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

          {/* Nearby Spoted Dots */}
          <View style={[styles.radarDot, { top: '28%', left: '32%' }]} />
          <View style={[styles.radarDot, { top: '65%', left: '72%' }]} />
          <View style={[styles.radarDot, { top: '40%', left: '78%' }]} />

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
      </View>

      {/* Bottom Target Card & Navigation CTA */}
      <View style={styles.bottomSection}>
        <View style={styles.targetCard}>
          <View style={styles.cardThumbnailPlaceholder}>
            <Text style={styles.thumbnailIcon}>🏢</Text>
          </View>

          <View style={styles.cardTextGroup}>
            <Text style={styles.cardTitle}>天神ビルのベンチ</Text>
            <Text style={styles.cardSnippet}>「ランチが美味しかった…」</Text>
            <View style={styles.cardTagsRow}>
              <View style={styles.cardTagPill}>
                <Text style={styles.cardTagText}>#グルメ</Text>
              </View>
              <View style={styles.cardTagPill}>
                <Text style={styles.cardTagText}>#日常</Text>
              </View>
              <Text style={styles.cardDistanceText}>📍 120 m</Text>
            </View>
          </View>
        </View>

        {/* Start Navigation Button */}
        <TouchableOpacity
          style={styles.navButton}
          activeOpacity={0.85}
          onPress={onStartNavigation}
        >
          <Text style={styles.navButtonText}>ナビを開始</Text>
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
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },

  // Alert Banner
  alertBanner: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  alertIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  alertPin: {
    fontSize: 16,
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  alertSubtitle: {
    color: '#475569',
    fontSize: 12,
  },
  alertDistance: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },

  // Center Radar
  radarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  radarCircle: {
    width: width * 0.76,
    height: width * 0.76,
    borderRadius: (width * 0.76) / 2,
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
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
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
    fontSize: 54,
    textShadowColor: 'rgba(16, 185, 129, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  // Bottom Section
  bottomSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  targetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardThumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  thumbnailIcon: {
    fontSize: 26,
  },
  cardTextGroup: {
    flex: 1,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  cardSnippet: {
    color: '#475569',
    fontSize: 12,
    marginTop: 2,
  },
  cardTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  cardTagPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardTagText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  cardDistanceText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  navButton: {
    backgroundColor: '#10B981',
    height: 54,
    borderRadius: 27,
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
