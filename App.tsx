import React, { useState } from 'react';
import {
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { DiscoveryRadarScreen } from './src/components/DiscoveryRadarScreen';
import { MyPageScreen } from './src/components/MyPageScreen';
import { NotificationScreen } from './src/components/NotificationScreen';
import { PostModal } from './src/components/PostModal';
import { TagManageModal } from './src/components/TagManageModal';
import { UniversalARView } from './src/native/UniversalARView';
import { Icons } from './src/assets/icons';

type TabType = 'home' | 'radar' | 'notifications' | 'mypage';

export default function App(): React.JSX.Element {
  // ホームはAR機能そのもの
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isPostModalVisible, setIsPostModalVisible] = useState<boolean>(false);
  const [isTagModalVisible, setIsTagModalVisible] = useState<boolean>(false);

  // AR Card Data
  const [currentMessage, setCurrentMessage] = useState<string>('ここの席、午後の光が最高。');
  const [currentAuthor] = useState<string>('sora');
  const [currentHandle] = useState<string>('@sora');
  const [selectedTag, setSelectedTag] = useState<string>('#カフェ');
  const [placeTrigger, setPlaceTrigger] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handlePostSubmit = (data: { message: string; tags: string[]; category: string }) => {
    setIsPostModalVisible(false);
    setCurrentMessage(data.message);
    if (data.tags[0]) setSelectedTag(data.tags[0]);
    // Trigger spatial placement in AR
    setPlaceTrigger((prev) => prev + 1);
    showToast('言葉を空間に配置しました！');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={activeTab === 'home' ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />

      {/* Main View Area */}
      <View style={styles.mainContainer}>
        {/* 1. Home = Pure AR Camera Screen (No remote timeline - in-place only) */}
        {activeTab === 'home' && (
          <View style={styles.arContainer}>
            <UniversalARView
              style={StyleSheet.absoluteFill}
              cardTitle={currentAuthor}
              cardDescription={currentMessage}
              cardColor="#10B981"
              cardIcon={currentHandle}
              placeTrigger={placeTrigger}
              onScreenTapped={() => {
                // Tap on space to compose message
                setIsPostModalVisible(true);
              }}
              onCardPlaced={(event) => {
                const { cardDescription } = event.nativeEvent;
                showToast(`「${cardDescription}」を配置しました`);
              }}
            />

            {/* Top AR Header */}
            <View style={styles.arTopHeader}>
              <View style={styles.logoPill}>
                <Text style={styles.logoPillText}>Loca</Text>
              </View>
            </View>

            {/* Toast Message */}
            {toastMessage && (
              <View style={styles.toastContainer} pointerEvents="none">
                <View style={styles.toastCard}>
                  <Text style={styles.toastText}>{toastMessage}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* 2. Discovery Radar Screen (Walking navigation) */}
        {activeTab === 'radar' && (
          <DiscoveryRadarScreen
            onBack={() => setActiveTab('home')}
            onStartNavigation={() => setActiveTab('home')}
          />
        )}

        {/* 3. Notifications Screen (Pocket alerts) */}
        {activeTab === 'notifications' && (
          <NotificationScreen
            onOpenARWithTag={(tag) => {
              setSelectedTag(tag);
              setActiveTab('home');
            }}
          />
        )}

        {/* 4. MyPage Screen (Profile & history) */}
        {activeTab === 'mypage' && (
          <MyPageScreen
            onOpenARLens={() => setActiveTab('home')}
            onOpenTagManage={() => setIsTagModalVisible(true)}
          />
        )}
      </View>

      {/* Global Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.home}
            style={[styles.navIcon, activeTab === 'home' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'home' && styles.navLabelActive]}>
            ホーム
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('radar')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.search}
            style={[styles.navIcon, activeTab === 'radar' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'radar' && styles.navLabelActive]}>
            探索
          </Text>
        </TouchableOpacity>

        {/* Center Plus Button (Emerald Green circle) */}
        <TouchableOpacity
          style={styles.centerPlusButton}
          onPress={() => {
            setActiveTab('home');
            setIsPostModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.centerPlusIcon}>＋</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('notifications')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.notice}
            style={[styles.navIcon, activeTab === 'notifications' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'notifications' && styles.navLabelActive]}>
            通知
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('mypage')}
          activeOpacity={0.7}
        >
          <Image
            source={Icons.mypage}
            style={[styles.navIcon, activeTab === 'mypage' && styles.navIconActive]}
            resizeMode="contain"
          />
          <Text style={[styles.navLabel, activeTab === 'mypage' && styles.navLabelActive]}>
            マイページ
          </Text>
        </TouchableOpacity>
      </View>

      {/* Post Modal (AI suggestions, message input) */}
      <PostModal
        visible={isPostModalVisible}
        onClose={() => setIsPostModalVisible(false)}
        onSubmit={handlePostSubmit}
      />

      {/* Tag Management Modal (Tag filter / Calm settings) */}
      <TagManageModal
        visible={isTagModalVisible}
        onClose={() => setIsTagModalVisible(false)}
        onSave={(tags) => {
          if (tags[0]) setSelectedTag(tags[0]);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mainContainer: {
    flex: 1,
  },
  arContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },

  // AR Top Header
  arTopHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  logoPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoPillText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Toast
  toastContainer: {
    position: 'absolute',
    top: '46%',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 25,
  },
  toastCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },

  // Global Bottom Navigation Bar
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 12,
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
    paddingVertical: 4,
    minWidth: 50,
  },
  navIcon: {
    width: 22,
    height: 22,
    tintColor: '#94A3B8',
  },
  navIconActive: {
    tintColor: '#10B981',
  },
  navLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
  centerPlusButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  centerPlusIcon: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 36,
  },
});
