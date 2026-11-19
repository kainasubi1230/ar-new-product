import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { AVATAR_COLORS } from '../../config/avatarColors';
import { styles } from './styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 見本に出す頭文字の元 */
  displayName: string;
  avatarColor: string;
  onSelect: (hex: string) => void;
};

/** アイコン（名前の頭文字の丸）の色を選ぶ */
export function AvatarColorModal({ visible, onClose, displayName, avatarColor, onSelect }: Props): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.avatarModalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.avatarModalSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.avatarModalHeader}>
            <Text style={styles.avatarModalTitle}>アイコンの色を選ぶ</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.avatarModalCloseBtn}
            >
              <Text style={styles.avatarModalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>


          <View style={styles.avatarGrid}>
            {AVATAR_COLORS.map((opt) => {
              const isSelected = avatarColor.toLowerCase() === opt.hex.toLowerCase();
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.avatarOptionItem, isSelected && styles.avatarOptionItemSelected]}
                  onPress={() => onSelect(opt.hex)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatarOptionCircle, { backgroundColor: opt.hex, borderColor: opt.hex }]}>
                    <Text style={styles.avatarOptionInitial}>{displayName.slice(0, 1)}</Text>
                  </View>
                  <Text style={[styles.avatarOptionLabel, isSelected && styles.avatarOptionLabelSelected]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Text style={styles.avatarSelectedBadge}>✓ 選択中</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
