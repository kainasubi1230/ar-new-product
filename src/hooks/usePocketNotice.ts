import { useEffect, useRef } from 'react';
import { POCKET_NOTICE } from '../config/pocketNotice';
import { findNearbyPosts } from '../services/nearbyPostService';
import type { LocationCoords } from '../services/postService';
import {
  isPocketNoticeSupported,
  onNotificationOpened,
  onPocketLocation,
  requestNotificationPermission,
  startPocketNotice,
  stopPocketNotice,
  updatePocketTargets,
} from '../services/pocketNotificationService';
import { distanceInMeters } from '../utils/geo';
import { findMatchedInterestTag, matchesInterestTags } from '../utils/interestTags';

/**
 * ポケット通知の見張り（App.tsx から分けたもの）。
 * オンの間、関心タグに合うメッセージ（自分の投稿以外）をネイティブ（LocaPocket）に渡し、近くに来たら通知してもらう。
 * 通知をタップしてアプリが開いたら onOpened を呼ぶ
 */
export function usePocketNotice({
  enabled,
  interestTags,
  userId,
  hiddenUserIds,
  hiddenPostIds,
  onOpened,
}: {
  enabled: boolean;
  interestTags: string[];
  userId: string | null;
  /** ブロックした人（その人の言葉は通知しない） */
  hiddenUserIds: string[];
  /** 通報した言葉（通知しない） */
  hiddenPostIds: string[];
  onOpened: () => void;
}) {
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  // ポケット通知：オンの間、関心タグに合うメッセージ（自分の投稿以外）をネイティブに渡して見張ってもらう。
  // 位置の見張りと通知はネイティブ（LocaPocket）が行うので、アプリをポケットに入れても届く
  const interestTagsKey = interestTags.join('|');
  const hiddenKey = `${hiddenUserIds.join('|')}/${hiddenPostIds.join('|')}`;
  useEffect(() => {
    if (!isPocketNoticeSupported || !enabled || interestTags.length === 0) {
      stopPocketNotice();
      return;
    }
    let cancelled = false;
    let origin: LocationCoords | null = null;

    const refreshTargets = async (coords: LocationCoords) => {
      origin = coords;
      try {
        const posts = await findNearbyPosts(coords, {
          radiusM: POCKET_NOTICE.targetRadiusM,
          limit: POCKET_NOTICE.targetLimit,
        });
        if (cancelled) return;
        const targets = posts
          .filter((post) => !userId || post.user_id !== userId)
          .filter((post) => !(post.user_id && hiddenUserIds.includes(post.user_id)))
          .filter((post) => !hiddenPostIds.includes(String(post.id)))
          .filter((post) => matchesInterestTags(post.tags, interestTags))
          .map((post) => {
            // 関連タグで合った投稿（#街歩き → 関心タグ #散歩）も、合った関心タグの名前で知らせる
            const tag = findMatchedInterestTag(post.tags, interestTags);
            return {
              postId: String(post.id),
              latitude: post.latitude,
              longitude: post.longitude,
              // Calm：本文は出さず、「このあたりにある」ことだけ伝える
              title: tag ? `近くに ${tag} の言葉があります` : '近くに関心のある言葉があります',
              body: 'このあたりに置かれています。ARでそっとのぞいてみてください',
            };
          });
        updatePocketTargets(targets);
      } catch (err) {
        console.warn('ポケット通知の対象の取得に失敗しました:', err);
      }
    };

    // 位置はネイティブから届く（最初の 1 回と、50m 動くごと）。refetchDistanceM 動いたら対象を取り直す
    let latest: LocationCoords | null = null;
    const subscription = onPocketLocation((location) => {
      latest = location;
      if (
        !origin ||
        distanceInMeters(origin.latitude, origin.longitude, location.latitude, location.longitude) >=
          POCKET_NOTICE.refetchDistanceM
      ) {
        refreshTargets(location);
      }
    });
    // 動いていなくても定期的に取り直す（同じ場所にいるまま、あとから置かれたメッセージにも気づく）
    const refreshTimer = setInterval(() => {
      if (latest) refreshTargets(latest);
    }, POCKET_NOTICE.refreshIntervalMs);
    requestNotificationPermission().then((granted) => {
      if (!cancelled && granted) startPocketNotice([]);
    });
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
      subscription?.remove();
      stopPocketNotice();
    };
    // 関心タグの中身は interestTagsKey で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, interestTagsKey, userId, hiddenKey]);

  // ポケット通知をタップしてアプリを開いたら、ホームのカメラを出す
  useEffect(() => {
    const subscription = onNotificationOpened(() => onOpenedRef.current());
    return () => subscription?.remove();
  }, []);
}
