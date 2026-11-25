import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { ScreenHeader } from './ScreenHeader';
import { Icons } from '../assets/icons';
import { findPostsInRegion, MAP_REGION_LIMIT, type NearbyPost } from '../services/nearbyPostService';
import type { LocationCoords } from '../services/postService';
import { DISTANCE_TIERS, geoTagLevelFor } from '../config/distanceTiers';
import { useHeading } from '../hooks/useHeading';
import { findMatchedInterestTag } from '../utils/interestTags';
import { fetchCollectedPostIds } from '../services/readService';
import { usePreferences } from '../services/preferencesStore';
import {
  findHeritageInRegion,
  heritageIcon,
  heritageKindText,
  heritageSourceUrl,
  isMajorHeritage,
  type NearbyHeritageSite,
} from '../services/heritageService';

type Props = {
  /** 近い順の、近くの投稿（位置・距離・方角つき） */
  posts: NearbyPost[];
  /** 今の位置。まだ分からなければ null */
  coords: LocationCoords | null;
  /** 関心タグ。合う投稿のピンを少し目立たせる */
  interestTags: string[];
  /** AR（ホームのカメラ）で、選んだ言葉を探す（post は探す言葉。無ければふだん通り） */
  onOpenAR: (post: NearbyPost | null) => void;
  /** 表示の設定（関心タグのみ・安心フィルター）で出してよい投稿か。地図の範囲で取った投稿にもかける */
  isPostVisible: (post: NearbyPost) => boolean;
  /** 他の人の言葉のメニュー（通報・ブロック）を出す。自分の言葉では出さない */
  onOpenPostMenu: (post: NearbyPost) => void;
  /** 自分の投稿か（「…」を出さない） */
  isOwnPost: (post: NearbyPost) => boolean;
  /** ログイン中の人（拾った言葉のピンを淡くするため）。未ログインなら null */
  userId: string | null;
};

// ピンの色（文字は出さず、色で分ける）
const PIN_GREEN = '#10B981';
// 拾った言葉：くすんだ緑（もう読んだので控えめに）
const PIN_COLLECTED = '#9CC5B5';
// 関心タグに関係する言葉のピン（どの関心タグでも同じ色。ふつうの緑・拾った淡い緑と見分けがつく色）
const PIN_INTEREST = '#007BA7';

const NO_TAGS: string[] = [];

// 下のカードの高さ（どのカードも同じ。メッセージのカードの中身がいちばん多いとき：余白 32 + 見出し 40 + 本文 3 行 75 + タグ 25 + ボタン 60 + 枠 2）
const CARD_HEIGHT = 236;

type PinLook = { fill: string; border: string; kind: 'own' | 'collected' | 'interest' | 'default' };

/**
 * ピンの見た目：自分の言葉 → 拾った言葉 → 関心タグに関係する言葉（セルリアンブルー）→ ふつう（緑）の順で決める。
 * interestTags は、マイページの「関心タグ」がオンのときだけ渡す（オフなら空＝色を付けない）
 */
const pinLookOf = (
  post: NearbyPost,
  isOwn: boolean,
  isCollected: boolean,
  interestTags: string[]
): PinLook => {
  if (isOwn) return { fill: '#FFFFFF', border: PIN_GREEN, kind: 'own' };
  if (isCollected) return { fill: PIN_COLLECTED, border: '#FFFFFF', kind: 'collected' };
  const matched = findMatchedInterestTag(post.tags, interestTags);
  if (matched) return { fill: PIN_INTEREST, border: '#FFFFFF', kind: 'interest' };
  return { fill: PIN_GREEN, border: '#FFFFFF', kind: 'default' };
};

// これより広い範囲（緯度の幅、度）を映しているときは取りに行かない（日本全体などを映すと重い・意味が薄い）
const MAX_FETCH_SPAN_DEG = 0.6;
// 文化遺産のピンは同梱データなので、もう少し広い範囲まで出す（真ん中に近い順に上限まで）
const HERITAGE_MAX_SPAN_DEG = 2.0;
// 地図を動かし終えてから取りに行くまでの待ち（動かしている途中で何度も取らない）
const REGION_FETCH_DELAY_MS = 400;

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
 * 文化遺産のピン。Marker の image は、この版の react-native-maps だと新しいアーキテクチャで画像が読み込まれない
 * （古いブリッジ経由で読むため）ので、メッセージのピンと同じく View で描く。
 * 地図に描いたピンは止めた絵になる（tracksViewChanges=false）ので、絵が読み込めてから・選んだ/外したときだけ少しの間描き直す
 */
const HeritageMarker = memo(function HeritageMarker({
  site,
  isSelected,
  onSelect,
}: {
  site: NearbyHeritageSite;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTracking, setIsTracking] = useState(true);
  const isMajor = isMajorHeritage(site);
  useEffect(() => {
    if (!isLoaded) return;
    setIsTracking(true);
    const timer = setTimeout(() => setIsTracking(false), 300);
    return () => clearTimeout(timer);
  }, [isLoaded, isSelected]);

  return (
    <Marker
      coordinate={{ latitude: site.lat, longitude: site.lng }}
      onPress={() => onSelect(site.id)}
      tracksViewChanges={isTracking}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={isSelected ? 1 : 0}
    >
      <View
        style={[
          styles.heritagePin,
          isMajor && styles.heritagePinMajor,
          isSelected && styles.heritagePinSelected,
        ]}
      >
        <Image
          source={heritageIcon(site)}
          style={[
            styles.heritagePinIcon,
            isMajor && styles.heritagePinIconMajor,
            isSelected && styles.heritagePinIconSelected,
          ]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setIsLoaded(true)}
        />
      </View>
    </Marker>
  );
});

/** 選んでいるピン：メッセージか文化遺産か */
type Selection = { type: 'post' | 'heritage'; id: string };

/**
 * 探索ページ：地図に、近くのメッセージと文化遺産のピンを出す（iOS は Apple のマップ。API キー・料金なし）
 */
export function DiscoveryMapScreen({
  posts: nearbyPosts,
  coords,
  interestTags,
  onOpenAR,
  isPostVisible,
  onOpenPostMenu,
  isOwnPost,
  userId,
}: Props): React.JSX.Element {
  const mapRef = useRef<MapView>(null);
  // 下のカードの方向（「右前方」など）と矢印のために、スマホの向きを使う
  const { heading } = useHeading(true);

  // 地図に映っている範囲の投稿（近くの投稿に限らず、地図を動かした先の分も出す）
  const [regionPosts, setRegionPosts] = useState<NearbyPost[]>([]);
  const [isZoomedOutTooFar, setIsZoomedOutTooFar] = useState(false);
  const [isRegionFull, setIsRegionFull] = useState(false);
  const regionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionRequestRef = useRef(0);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  // 拾った言葉（ピンを淡くする）。ログインしていなければ空
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId) {
      setCollectedIds(new Set());
      return;
    }
    let cancelled = false;
    fetchCollectedPostIds(userId)
      .then((ids) => {
        if (!cancelled) setCollectedIds(ids);
      })
      .catch((err) => console.warn(err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 地図に映っている範囲の文化遺産（同梱データから、その場で絞り込む）
  const [heritageSites, setHeritageSites] = useState<NearbyHeritageSite[]>([]);
  const { showHeritagePins, setShowHeritagePins, onlyInterestTags } = usePreferences();
  // 関心タグの色分けは、マイページの「関心タグ」がオンのときだけ（オフなら、関心タグを選んであっても色を付けない）
  const activeInterestTags = onlyInterestTags ? interestTags : NO_TAGS;
  // 選んでいる文化遺産は、地図を動かして間引かれても消さない
  const selectedHeritageIdRef = useRef<string | null>(null);

  const loadRegion = (region: Region) => {
    if (regionTimerRef.current) clearTimeout(regionTimerRef.current);
    setHeritageSites(
      region.latitudeDelta > HERITAGE_MAX_SPAN_DEG ? [] : findHeritageInRegion(region, coordsRef.current, selectedHeritageIdRef.current)
    );
    if (region.latitudeDelta > MAX_FETCH_SPAN_DEG) {
      setIsZoomedOutTooFar(true);
      return;
    }
    setIsZoomedOutTooFar(false);
    regionTimerRef.current = setTimeout(() => {
      const requestId = ++regionRequestRef.current;
      findPostsInRegion(region, coordsRef.current)
        .then((found) => {
          // 古い問い合わせの結果が、あとから届いて上書きしないように
          if (requestId !== regionRequestRef.current) return;
          setRegionPosts(found);
          setIsRegionFull(found.length >= MAP_REGION_LIMIT);
        })
        .catch((err) => console.warn(err));
    }, REGION_FETCH_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (regionTimerRef.current) clearTimeout(regionTimerRef.current);
    },
    []
  );

  // 近くの投稿（現在地からの正確な距離つき）と、地図の範囲の投稿を合わせて、近い順に。表示の設定で隠すものは出さない
  const posts = useMemo(() => {
    const byId = new Map<string, NearbyPost>();
    for (const post of regionPosts) {
      if (isPostVisible(post)) byId.set(String(post.id), post);
    }
    for (const post of nearbyPosts) byId.set(String(post.id), post);
    return [...byId.values()].sort((a, b) => a.distanceM - b.distanceM);
  }, [regionPosts, nearbyPosts, isPostVisible]);

  // 選んだピン。文化遺産を選んでいればその説明を、そうでなければ選んだ投稿（最初は一番近いもの）を出す。
  // 一覧から消えたら一番近い投稿に戻す
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedHeritage = useMemo(
    () =>
      selection?.type === 'heritage' ? heritageSites.find((h) => h.id === selection.id) ?? null : null,
    [heritageSites, selection]
  );
  selectedHeritageIdRef.current = selectedHeritage?.id ?? null;
  const selected = useMemo(
    () =>
      selectedHeritage
        ? null
        : posts.find((p) => selection?.type === 'post' && String(p.id) === selection.id) ?? posts[0] ?? null,
    [posts, selection, selectedHeritage]
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

  // HeritageMarker を memo で描き直さないように、同じ関数を渡し続ける
  const selectHeritage = useMemo(() => (id: string) => setSelection({ type: 'heritage', id }), []);

  const selectedRelative = selected && heading != null ? selected.bearingDeg - heading : null;
  const heritageRelative =
    selectedHeritage && heading != null ? selectedHeritage.bearingDeg - heading : null;
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
          onRegionChangeComplete={loadRegion}
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
          {/* 文化遺産のピン（メッセージのピンより下に） */}
          {showHeritagePins && heritageSites.map((site) => (
            <HeritageMarker
              key={`heritage:${site.id}`}
              site={site}
              isSelected={selectedHeritage?.id === site.id}
              onSelect={selectHeritage}
            />
          ))}

          {posts.map((post) => {
            const level = geoTagLevelFor(post.distanceM);
            const isSelected = selected != null && String(selected.id) === String(post.id);
            const look = pinLookOf(post, isOwnPost(post), collectedIds.has(String(post.id)), activeInterestTags);
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
                  onPress={() => setSelection({ type: 'post', id: String(post.id) })}
                  tracksViewChanges={false}
                  zIndex={2}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  {/* 文字は出さず、色で分ける（自分・拾った・関心タグの色・ふつう）。距離は大きさと濃さ */}
                  <View
                    style={[
                      styles.pinWrapper,
                      level === 'summary' && styles.pinWrapperFar,
                      level === 'presence' && styles.pinWrapperNear,
                    ]}
                  >
                    <View
                      style={[
                        styles.pinHead,
                        { backgroundColor: look.fill, borderColor: look.border },
                        look.kind === 'own' && styles.pinHeadOwn,
                        look.kind === 'interest' && styles.pinHeadInterest,
                        level === 'summary' && styles.pinHeadFar,
                        isSelected && styles.pinHeadSelected,
                      ]}
                    />
                    <View
                      style={[
                        styles.pinTail,
                        { backgroundColor: look.kind === 'own' ? PIN_GREEN : look.fill },
                        level === 'summary' && styles.pinTailFar,
                      ]}
                    />
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapView>

        {/* 件数 */}
        <View style={styles.statusPill} pointerEvents="none">
          <Text style={styles.statusText}>
            {isZoomedOutTooFar
              ? '近づけると、メッセージが表示されます'
              : !coords && posts.length === 0
                ? '現在地を調べています…'
                : posts.length > 0
                  ? `この範囲に ${posts.length}${isRegionFull ? '+' : ''} 件のメッセージ`
                  : 'この範囲にメッセージはまだありません'}
          </Text>
        </View>

        {/* ピンの色の見方 */}
        {posts.length > 0 && (
          <View style={styles.legend} pointerEvents="none">
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PIN_GREEN }]} />
              <Text style={styles.legendText}>言葉</Text>
            </View>
            {/* 関心タグがオンのときだけ */}
            {activeInterestTags.length > 0 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: PIN_INTEREST }]} />
                <Text style={styles.legendText}>関心タグの言葉</Text>
              </View>
            )}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: PIN_COLLECTED }]} />
              <Text style={styles.legendText}>拾った言葉</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotOwn]} />
              <Text style={styles.legendText}>自分の言葉</Text>
            </View>
          </View>
        )}

        {/* 文化遺産のピンを出す・隠す */}
        <TouchableOpacity
          style={[styles.heritageToggle, showHeritagePins && styles.heritageToggleOn]}
          onPress={() => {
            if (showHeritagePins && selectedHeritage) setSelection(null);
            setShowHeritagePins(!showHeritagePins);
          }}
          activeOpacity={0.8}
          accessibilityLabel={showHeritagePins ? '文化遺産を隠す' : '文化遺産を表示'}
        >
          <Image
            source={Icons.heritageTemple}
            style={[styles.heritageToggleIcon, showHeritagePins && styles.heritageToggleIconOn]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* 現在地に戻る */}
        {coords && (
          <TouchableOpacity style={styles.recenterButton} onPress={recenter} activeOpacity={0.8}>
            <Text style={styles.recenterText}>◎</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 選んだ文化遺産・投稿 */}
      <View style={styles.bottomSection}>
        {selectedHeritage ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.heritageIconCircle}>
                <Image source={heritageIcon(selectedHeritage)} style={styles.heritageIcon} resizeMode="contain" />
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.heritageName} numberOfLines={2}>
                  {selectedHeritage.name}
                </Text>
                <Text style={styles.heritageKind}>{heritageKindText(selectedHeritage)}</Text>
              </View>
            </View>
            <Text style={styles.heritageDistance}>
              {heritageRelative != null ? `${directionText(heritageRelative)} ` : ''}
              {distanceText(selectedHeritage.distanceM)}
            </Text>
            <Text style={styles.heritageDesc} numberOfLines={3}>
              {selectedHeritage.desc}
            </Text>
            <View style={styles.cardSpacer} />
            {/* 説明は Wikipedia（CC BY-SA 4.0）から。出典の表示はライセンスの条件（カードを固定の高さにしても必ず見えるよう、いちばん下に置く） */}
            <TouchableOpacity
              onPress={() => Linking.openURL(heritageSourceUrl(selectedHeritage)).catch(() => {})}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.heritageSource}>
                出典：Wikipedia「{selectedHeritage.wiki}」（CC BY-SA 4.0）
              </Text>
            </TouchableOpacity>
          </View>
        ) : selected ? (
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
                <Text style={styles.cardAuthor}>{selected.author ?? 'ゲスト'}さんのメッセージ</Text>
              </View>
              {!isOwnPost(selected) && (
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => onOpenPostMenu(selected)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.6}
                >
                  <View style={styles.menuDot} />
                  <View style={styles.menuDot} />
                  <View style={styles.menuDot} />
                </TouchableOpacity>
              )}
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
            {tagLine(selected.tags) !== '' && (
              <Text style={styles.cardTags} numberOfLines={1}>
                {tagLine(selected.tags)}
              </Text>
            )}

            <View style={styles.cardSpacer} />
            <TouchableOpacity
              style={styles.arButton}
              activeOpacity={0.85}
              onPress={() => onOpenAR(selected)}
            >
              <Text style={styles.arButtonText}>この言葉をARで探す</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, styles.cardEmpty]}>
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

  // ピン（文字なしの丸。色は pinLookOf で決める）
  pinWrapper: {
    alignItems: 'center',
  },
  // 遠い（タグと距離だけの段階）：薄く
  pinWrapperFar: {
    opacity: 0.6,
  },
  // すぐ近く：位置があやふやなので少し淡く（まわりの輪が「このあたり」）
  pinWrapperNear: {
    opacity: 0.85,
  },
  pinHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  // 自分の言葉：白い丸に緑のふち
  pinHeadOwn: {
    borderWidth: 4,
  },
  // 関心タグに合う言葉：少し大きく
  pinHeadInterest: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  pinHeadFar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  pinHeadSelected: {
    transform: [{ scale: 1.3 }],
  },
  pinTail: {
    width: 2,
    height: 7,
  },
  pinTailFar: {
    height: 5,
  },
  // ピンの色の見方
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 14,
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 4,
  },
  legendDotOwn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: PIN_GREEN,
  },
  legendText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
  },

  bottomSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  // 下のカードは、メッセージ・文化遺産・何も選んでいないときのどれも同じ高さ（押すたびに地図の大きさが変わらないように）。
  // 高さは、メッセージのカードがいちばん長いとき（本文 3 行・タグ・ボタン）に合わせる
  card: {
    height: CARD_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 中身が短いときに、ボタン・出典をカードのいちばん下に寄せる
  cardSpacer: {
    flex: 1,
    minHeight: 8,
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
  // 文化遺産のピン（落ち着いた土色の丸に白い絵）
  // ふつうの文化遺産：小さく淡く（メッセージより目立たないように）
  heritagePin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#B89B74',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4A3218',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  // 世界遺産・国宝・特別史跡・特別名勝：濃く大きく
  heritagePinMajor: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9A7445',
  },
  heritagePinIconMajor: {
    width: 15,
    height: 15,
  },
  heritagePinSelected: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7A562C',
    borderWidth: 3,
  },
  heritagePinIcon: {
    width: 12,
    height: 12,
    tintColor: '#FFFFFF',
  },
  heritagePinIconSelected: {
    width: 19,
    height: 19,
  },
  // 文化遺産のピンを出す・隠すボタン（現在地ボタンの上）
  heritageToggle: {
    position: 'absolute',
    right: 14,
    bottom: 68,
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
  heritageToggleOn: {
    backgroundColor: '#9A7445',
  },
  heritageToggleIcon: {
    width: 22,
    height: 22,
    tintColor: '#94A3B8',
  },
  heritageToggleIconOn: {
    tintColor: '#FFFFFF',
  },
  // 文化遺産のカード
  heritageIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9A7445',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heritageIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  heritageName: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  heritageKind: {
    marginTop: 2,
    color: '#7A562C',
    fontSize: 12,
    fontWeight: '700',
  },
  heritageDistance: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  heritageDesc: {
    flexShrink: 1,
    marginTop: 6,
    color: '#1E293B',
    fontSize: 14,
    lineHeight: 21,
  },
  heritageSource: {
    color: '#94A3B8',
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  // 通報・ブロックのメニュー（…）
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 8,
    marginLeft: 8,
  },
  menuDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
  },
});
