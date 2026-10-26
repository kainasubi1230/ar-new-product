import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
  /** 表示する気配の投稿。null なら閉じている */
  presence: { authorName: string; snapshotPath: string | null } | null;
  onClose: () => void;
};

/**
 * 気配（照合できていない近くの投稿の光）をタップしたときの案内。
 * 本文は見せず、「このあたりにある」ことと、置いたときの景色の写真だけを見せる（景色が合うとその場所に現れる）
 */
export function PresenceSheet({ presence, onClose }: Props): React.JSX.Element | null {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const snapshotPath = presence?.snapshotPath ?? null;

  useEffect(() => {
    setSnapshotUrl(null);
    if (!snapshotPath) return;
    let cancelled = false;
    // 写真は非公開のバケットにあるので、しばらく使える URL を発行して表示する
    supabase.storage
      .from('worldmaps')
      .createSignedUrl(snapshotPath, 300)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSnapshotUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotPath]);

  if (!presence) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.card}>
        <Text style={styles.title}>このあたりに{presence.authorName}さんのメッセージがあります</Text>
        <Text style={styles.subtitle}>景色が合うと、その場所に現れます</Text>
        {snapshotPath && (
          <View style={styles.snapshotFrame}>
            {snapshotUrl ? (
              <Image source={{ uri: snapshotUrl }} style={styles.snapshot} resizeMode="cover" />
            ) : (
              <View style={styles.snapshotPlaceholder} />
            )}
            <Text style={styles.snapshotCaption}>置いたときの景色</Text>
          </View>
        )}
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.closeText}>とじる</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    padding: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    zIndex: 40,
  },
  title: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 21,
  },
  subtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  snapshotFrame: {
    marginTop: 14,
    alignItems: 'center',
  },
  snapshot: {
    width: 150,
    height: 220,
    borderRadius: 14,
  },
  snapshotPlaceholder: {
    width: 150,
    height: 220,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  snapshotCaption: {
    marginTop: 6,
    color: '#94A3B8',
    fontSize: 11,
  },
  closeButton: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  closeText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
  },
});
