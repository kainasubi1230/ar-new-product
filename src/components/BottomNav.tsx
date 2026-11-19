import React from 'react';
import { Image, ImageSourcePropType, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icons } from '../assets/icons';

export type Tab = 'home' | 'radar' | 'notifications' | 'mypage';

type Props = {
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
  /** 真ん中の「＋」（言葉を置く） */
  onPressPost: () => void;
};

const LEFT: { tab: Tab; icon: ImageSourcePropType; label: string }[] = [
  { tab: 'home', icon: Icons.home, label: 'ホーム' },
  { tab: 'radar', icon: Icons.search, label: '探索' },
];
const RIGHT: { tab: Tab; icon: ImageSourcePropType; label: string }[] = [
  { tab: 'notifications', icon: Icons.notice, label: '通知' },
  { tab: 'mypage', icon: Icons.mypage, label: 'マイページ' },
];

/** 画面の下のタブ（ホーム・探索・＋・通知・マイページ） */
export function BottomNav({ activeTab, onSelect, onPressPost }: Props): React.JSX.Element {
  const renderItem = ({ tab, icon, label }: (typeof LEFT)[number]) => {
    const isActive = activeTab === tab;
    return (
      <TouchableOpacity key={tab} style={styles.navItem} onPress={() => onSelect(tab)} activeOpacity={0.7}>
        <Image source={icon} style={[styles.navIcon, isActive && styles.navIconActive]} resizeMode="contain" />
        <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.bottomNav}>
      {LEFT.map(renderItem)}
      <TouchableOpacity style={styles.centerPlusButton} onPress={onPressPost} activeOpacity={0.85}>
        <View style={styles.plusBarH} />
        <View style={styles.plusBarV} />
      </TouchableOpacity>
      {RIGHT.map(renderItem)}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minWidth: 56,
  },
  navIcon: {
    width: 26,
    height: 26,
    tintColor: '#94A3B8',
  },
  navIconActive: {
    tintColor: '#10B981',
  },
  navLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
  centerPlusButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  plusBarH: {
    position: 'absolute',
    width: 22,
    height: 3.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  plusBarV: {
    position: 'absolute',
    width: 3.5,
    height: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});
