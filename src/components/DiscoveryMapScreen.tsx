import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { ScreenHeader } from './ScreenHeader';
import type { NearbyPost } from '../services/nearbyPostService';
import type { LocationCoords } from '../services/postService';
import { DISTANCE_TIERS, geoTagLevelFor } from '../config/distanceTiers';
import { useHeading } from '../hooks/useHeading';
import { matchesInterestTags } from '../utils/interestTags';

type Props = {
  /** 近い順の、近くの投稿（位置・距離・方角つき） */
  posts: NearbyPost[];
  /** 今の位置。まだ分からなければ null */
  coords: LocationCoords | null;
  /** 関心タグ。合う投稿のピンを少し目立たせる */
  interestTags: string[];
  /** AR（ホームのカメラ）で見る */
  onOpenAR: () => void;
};

// 最初に映す範囲：方角タグの最大範囲（maxM）が画面に収まるくらい
const INITIAL_SPAN_DEG = (DISTANCE_TIERS.maxM * 2.4) / 111320;

const normalizeAngle = (deg: number) => ((deg % 360) + 540) % 360 - 180; // -180〜180

/** スマホの向きから見た方向を、ことばにする */
const directionText = (relativeDeg: number) => {
  const a = normalizeAngle(relativeDeg);
  const abs = Math.abs(a);
  if (abs <= 20) return '正面';
  if (abs >= 160) return '後ろ';
  const side = a > 0 ? '右' : '左';
  if (abs < 70) return `${side}前方`;
  if (abs <= 110) return side;
  return `${side}後方`;
};

const distanceText = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(5, Math.round(m / (m < 100 ? 5 : 10)) * (m < 100 ? 5 : 10))}m`;

const tagLine = (tags: string[] | null) =>
  (tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t && t !== '#')
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .join('  ');

/**
 * 探索ページ：地図に、近くのメッセージのピンを出す（iOS は Apple のマップ。API キー・料金なし）
 */
export function DiscoveryMapScreen({ posts, coords, interestTags, onOpenAR }: Props): React.JSX.Element {
  const mapRef = useRef<MapView>(null);
  // 下のカードの方向（「右前方」など）と矢印のために、スマホの向きを使う
  const { heading } = useHeading(true);

  // 選んだ投稿（最初は一番近いもの）。一覧から消えたら一番近いものに戻す
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => posts.find((p) => String(p.id) === selectedId) ?? posts[0] ?? null,
    [posts, selectedId]
  );

  // 位置が初めて分かったら、そこを中心に映す
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (!coords || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: INITIAL_SPAN_DEG,
        longitudeDelta: INITIAL_SPAN_DEG,
      },
      400
    );
  }, [coords]);

  const recenter = () => {
    if (!coords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: INITIAL_SPAN_DEG,
        longitudeDelta: INITIAL_SPAN_DEG,
      },
      400
    );
  };

  const selectedRelative = selected && heading != null ? selected.bearingDeg - heading : null;
  const selectedLevel = selected ? geoTagLevelFor(selected.distanceM) : null;

  return (
    <View style={styles.container}>
      <ScreenHeader title="探索" />

      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          // Calm：色を抑えた地図にする
          mapType="mutedStandard"
          showsUserLocation
          showsCompass
          showsPointsOfInterests={false}
          pitchEnabled={false}
          initialRegion={
            coords
              ? {
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: INITIAL_SPAN_DEG,
                  longitudeDelta: INITIAL_SPAN_DEG,
                }
              : undefined
          }
        >
          {posts.map((post) => {
            const level = geoTagLevelFor(post.distanceM);
            const isSelected = selected != null && String(selected.id) === String(post.id);
            const isInterest = matchesInterestTags(post.tags, interestTags);
            const coordinate = { latitude: post.latitude, longitude: post.longitude };
            return (
              <React.Fragment key={String(post.id)}>
                {/* すぐ近くの投稿は、位置の確かさの分だけ「このあたり」の輪で見せる（正確なふりをしない） */}
                {level === 'presence' && (
                  <Circle
                    center={coordinate}
                    radius={Math.max(post.accuracy_m ?? 10, 5)}
                    fillColor="rgba(52, 211, 153, 0.18)"
                    strokeColor="rgba(16, 185, 129, 0.35)"
                    strokeWidth={1}
                  />
                )}
                <Marker
                  coordinate={coordinate}
                  onPress={() => setSelectedId(String(post.id))}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <View style={styles.pinWrapper}>
                    <View
                      style={[
                        styles.pinHead,
                        level === 'summary' && styles.pinHeadFar,
                        level === 'presence' && styles.pinHeadNear,
                        isInterest && styles.pinHeadInterest,
                        isSelected && styles.pinHeadSelected,
                      ]}
                    >
                      <Text style={styles.pinLetter}>{(post.author ?? 'g').slice(0, 1)}</Text>
                    </View>
                    <View style={[styles.pinTail, level === 'summary' && styles.pinTailFar]} />
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapView>

        {/* 件数 */}
        <View style={styles.statusPill} pointerEvents="none">
          <Text style={styles.statusText}>
            {!coords
              ? '現在地を調べています…'
              : posts.length > 0
                ? `${DISTANCE_TIERS.maxM}m以内に ${posts.length} 件のメッセージ`
                : `${DISTANCE_TIERS.maxM}m以内にメッセージはまだありません`}
          </Text>
        </View>

        {/* 現在地に戻る */}
        {coords && (
          <TouchableOpacity style={styles.recenterButton} onPress={recenter} activeOpacity={0.8}>
            <Text style={styles.recenterText}>◎</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 選んだ投稿 */}
      <View style={styles.bottomSection}>
        {selected ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {/* 選んだ投稿の方向を指す矢印（スマホの向きが分かるときだけ） */}
              {selectedRelative != null && (
                <View style={[styles.pointer, { transform: [{ rotate: `${normalizeAngle(selectedRelative)}deg` }] }]}>
                  <Text style={styles.pointerText}>↑</Text>
                </View>
              )}
              <View style={styles.cardHeaderText}>
                <Text style={styles.cardDirection}>
                  {selectedRelative != null ? `${directionText(selectedRelative)} ` : ''}
                  {distanceText(selected.distanceM)}
                </Text>
                <Text style={styles.cardAuthor}>{selected.author ?? 'guest'}さんのメッセージ</Text>
              </View>
            </View>

            {/* 本文は AR と同じルール：messageM 以内のときだけ。すぐ近くでは「このあたり」とだけ伝える */}
            {selectedLevel === 'presence' ? (
              <Text style={styles.cardBody}>このあたりにあります。ARで景色が合うと、その場所に現れます</Text>
            ) : selectedLevel === 'message' ? (
              <Text style={styles.cardBody} numberOfLines={3}>
                {selected.message}
              </Text>
            ) : (
              <Text style={styles.cardBodyMuted}>近づくと本文が読めます</Text>
            )}
            {tagLine(selected.tags) !== '' && <Text style={styles.cardTags}>{tagLine(selected.tags)}</Text>}

            <TouchableOpacity style={styles.arButton} activeOpacity={0.85} onPress={onOpenAR}>
              <Text style={styles.arButtonText}>ARで見る</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardBodyMuted}>近くにメッセージが置かれると、ここに表示されます</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mapWrapper: {
    flex: 1,
  },
  statusPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  statusText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  recenterButton: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  recenterText: {
    color: '#059669',
    fontSize: 20,
  },

  // ピン
  pinWrapper: {
    alignItems: 'center',
  },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  // 遠い（タグと距離だけの段階）：小さく薄く
  pinHeadFar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.55)',
  },
  // すぐ近く：位置があやふやなので淡く（まわりの輪が「このあたり」）
  pinHeadNear: {
    backgroundColor: 'rgba(16, 185, 129, 0.7)',
  },
  // 関心タグに合う投稿：少し濃く大きく
  pinHeadInterest: {
    backgroundColor: '#047857',
    transform: [{ scale: 1.1 }],
  },
  pinHeadSelected: {
    borderColor: '#065F46',
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  pinLetter: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  pinTail: {
    width: 2,
    height: 8,
    backgroundColor: '#10B981',
  },
  pinTailFar: {
    height: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.55)',
  },

  bottomSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pointer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pointerText: {
    color: '#059669',
    fontSize: 22,
    fontWeight: '800',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardDirection: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  cardAuthor: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
  },
  cardBody: {
    marginTop: 12,
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  cardBodyMuted: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 13,
  },
  cardTags: {
    marginTop: 8,
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
  },
  arButton: {
    marginTop: 14,
    backgroundColor: '#10B981',
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
