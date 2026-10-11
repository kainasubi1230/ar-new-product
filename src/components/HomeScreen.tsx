import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

type Props = {
  onOpenAR: (tag?: string) => void;
  onOpenRadar: () => void;
};

type SpotItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  likes: number;
  author: string;
  location: string;
  imageBg: string;
};

const SAMPLE_POSTS: SpotItem[] = [
  {
    id: 'post-1',
    title: 'カフェラテのおすすめ',
    body: 'このカフェラテ、実はアイスの方がおすすめ。',
    tags: ['#カフェ', '#日常', '#グルメ'],
    likes: 28,
    author: 'sora',
    location: '福岡・天神',
    imageBg: '#2C3E50',
  },
  {
    id: 'post-2',
    title: '特等席の光',
    body: 'ここの席、午後の光が最高。',
    tags: ['#カフェ', '#日常'],
    likes: 42,
    author: 'sora',
    location: '天神カフェ通り',
    imageBg: '#34495E',
  },
  {
    id: 'post-3',
    title: '木陰のひと息',
    body: 'がんばりすぎないでね ここにいるよ。',
    tags: ['#思い出', '#自然'],
    likes: 87,
    author: 'mio',
    location: '天神中央公園',
    imageBg: '#1B4D3E',
  },
];

export function HomeScreen({ onOpenAR, onOpenRadar }: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'recommend' | 'popular' | 'new'>('recommend');

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Loca</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={onOpenRadar}>
            <Text style={styles.iconText}>🧭</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
            <Text style={styles.iconText}>🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Main Catchphrase */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>今日は、{'\n'}どこに行こう。</Text>
          <TouchableOpacity style={styles.areaSelector} activeOpacity={0.8}>
            <Text style={styles.areaIcon}>📍</Text>
            <Text style={styles.areaText}>福岡・天神エリア</Text>
            <Text style={styles.areaArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Filters */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'recommend' && styles.tabChipActive]}
            onPress={() => setActiveTab('recommend')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'recommend' && styles.tabTextActive]}>
              おすすめ
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'popular' && styles.tabChipActive]}
            onPress={() => setActiveTab('popular')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'popular' && styles.tabTextActive]}>
              人気
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'new' && styles.tabChipActive]}
            onPress={() => setActiveTab('new')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}>
              新着
            </Text>
          </TouchableOpacity>
        </View>

        {/* Cards Feed */}
        <View style={styles.cardsList}>
          {SAMPLE_POSTS.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[styles.postCard, { backgroundColor: post.imageBg }]}
              activeOpacity={0.9}
              onPress={() => onOpenAR(post.tags[0])}
            >
              {/* Overlay Gradient look */}
              <View style={styles.cardOverlay} />

              <View style={styles.cardContent}>
                <Text style={styles.cardBodyText}>「{post.body}」</Text>

                <View style={styles.cardFooter}>
                  <View style={styles.tagsRow}>
                    {post.tags.map((tag) => (
                      <View key={tag} style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.likesGroup}>
                    <Text style={styles.heartIcon}>♡</Text>
                    <Text style={styles.likesCount}>{post.likes}</Text>
                  </View>
                </View>
              </View>

              {/* View in AR Button Badge */}
              <View style={styles.arPillBadge}>
                <Text style={styles.arPillText}>ARで見る ↗</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontFamily: 'Snell Roundhand, Georgia, serif',
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  heroSection: {
    marginTop: 18,
    marginBottom: 20,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: 0.5,
  },
  areaSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  areaIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  areaText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  areaArrow: {
    color: '#94A3B8',
    fontSize: 16,
    marginLeft: 6,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  tabChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabChipActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  cardsList: {
    gap: 16,
  },
  postCard: {
    height: 180,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  cardContent: {
    zIndex: 2,
  },
  cardBodyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  likesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heartIcon: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  likesCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  arPillBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    zIndex: 3,
  },
  arPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
