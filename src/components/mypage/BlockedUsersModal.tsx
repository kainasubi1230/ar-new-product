import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchUserNames } from '../../services/moderationService';
import { styles as shared } from './styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  blockedUserIds: string[];
  /** ブロックを外す（終わるまで待つ） */
  onUnblock: (userId: string) => Promise<void>;
};

/** 歯車のメニューの「ブロック中の人」：ブロックした人の一覧と、ブロックの解除 */
export function BlockedUsersModal({ visible, onClose, blockedUserIds, onUnblock }: Props): React.JSX.Element {
  const [names, setNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    fetchUserNames(blockedUserIds)
      .then(setNames)
      .catch((err) => console.warn(err))
      .finally(() => setIsLoading(false));
    // 開いたときに一度だけ読む（解除で一覧が減っても読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await onUnblock(userId);
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={shared.avatarModalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={shared.avatarModalSheet} onStartShouldSetResponder={() => true}>
          <View style={shared.avatarModalHeader}>
            <Text style={shared.avatarModalTitle}>ブロック中の人</Text>
            <TouchableOpacity onPress={onClose} style={shared.avatarModalCloseBtn}>
              <View style={[shared.removeBar, shared.removeBarA, styles.closeBar]} />
              <View style={[shared.removeBar, shared.removeBarB, styles.closeBar]} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#10B981" style={styles.loading} />
          ) : blockedUserIds.length === 0 ? (
            <Text style={styles.empty}>ブロックしている人はいません</Text>
          ) : (
            <ScrollView style={styles.list}>
              {blockedUserIds.map((userId) => {
                const name = names[userId] ?? '名前のわからない人';
                return (
                  <View key={userId} style={styles.row}>
                    <View style={styles.initialCircle}>
                      <Text style={styles.initial}>{name.slice(0, 1)}</Text>
                    </View>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    <TouchableOpacity
                      style={styles.unblockButton}
                      onPress={() => handleUnblock(userId)}
                      disabled={unblockingId != null}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.unblockText}>{unblockingId === userId ? '解除中…' : '解除'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Text style={styles.note}>解除すると、その人の言葉がまた表示されるようになります。</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // × は灰色に（共通の × は白い線）
  closeBar: {
    backgroundColor: '#64748B',
  },
  loading: {
    marginVertical: 24,
  },
  empty: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 24,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  initialCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  name: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  unblockText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
  },
});
