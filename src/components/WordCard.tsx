import React, { ReactNode } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icons } from '../assets/icons';

type Props = {
  message: string;
  /** 「#」付きのタグ。空ならタグの行を出さない */
  tags: string[];
  /** 下の行の左側（日付・読まれた人数・投稿者など） */
  footer: ReactNode;
  onDelete: () => void;
};

/**
 * マイページの「残した言葉」「拾った言葉」のカード。本文をいちばん目立たせ、タグ、下の行（日付など・削除）の順に並べる
 */
export function WordCard({ message, tags, footer, onDelete }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.message}>{message}</Text>

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>{footer}</View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.6}>
          <Text style={styles.deleteText}>削除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** 下の行に並べる、小さな文字 */
export function WordCardMeta({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <Text style={styles.meta} numberOfLines={2}>
      {children}
    </Text>
  );
}

/**
 * 下の行に置く、日付と場所（カレンダーのアイコン＋「10/26 ・ 天神に置いた」）。
 * 場所の名前が無ければ「10/26 に置いた」
 */
export function WordCardDate({
  date,
  placeName,
  action,
}: {
  date: string;
  placeName: string | null | undefined;
  action: 'placed' | 'collected';
}): React.JSX.Element {
  const verb = action === 'placed' ? '置いた' : '拾った';
  const particle = action === 'placed' ? 'に' : 'で';
  return (
    <View style={styles.dateRow}>
      <Image source={Icons.calendar} style={styles.dateIcon} resizeMode="contain" />
      <Text style={styles.meta} numberOfLines={2}>
        {placeName ? `${date}  ・  ${placeName}${particle}${verb}` : `${date} に${verb}`}
      </Text>
    </View>
  );
}

/** 下の行に置く、拾われた人数（足あとのイラスト＋「◯人が読んだよ」） */
export function WordCardReadCount({ count }: { count: number }): React.JSX.Element {
  return (
    <View style={styles.readCount}>
      <Image source={Icons.footprints} style={styles.readCountIcon} resizeMode="contain" />
      <Text style={styles.meta}>{count}人が読んだよ</Text>
    </View>
  );
}

/** 下の行に置く、投稿者の頭文字の丸 */
export function WordCardAvatar({ name }: { name: string }): React.JSX.Element {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.slice(0, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  message: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  tagText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginTop: 14,
    marginBottom: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 12,
  },
  meta: {
    flexShrink: 1,
    color: '#64748B',
    fontSize: 12,
  },
  dateRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateIcon: {
    width: 12,
    height: 12,
    tintColor: '#64748B',
  },
  readCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readCountIcon: {
    width: 14,
    height: 11,
    tintColor: '#64748B',
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '800',
  },
  deleteText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
});
