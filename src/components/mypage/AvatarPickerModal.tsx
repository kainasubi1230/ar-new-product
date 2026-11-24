import React, { useEffect, useState } from 'react';
import { Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import {
  AVATAR_ANIMALS,
  AVATAR_COLORS,
  animalImageOf,
  type AvatarAnimal,
} from '../../config/avatarColors';
import { styles } from './styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  avatarAnimal: AvatarAnimal;
  avatarColor: string;
  /** 「これにする」を押したとき（動物と色をまとめて保存する） */
  onSelect: (animal: AvatarAnimal, hex: string) => void;
};

/** アイコンを選ぶ：動物と、後ろの丸の色。上の見本で確かめてから決める */
export function AvatarPickerModal({ visible, onClose, avatarAnimal, avatarColor, onSelect }: Props): React.JSX.Element {
  const [animal, setAnimal] = useState<AvatarAnimal>(avatarAnimal);
  const [color, setColor] = useState(avatarColor);

  // 開くたびに、今のアイコンから選び始める
  useEffect(() => {
    if (visible) {
      setAnimal(avatarAnimal);
      setColor(avatarColor);
    }
  }, [visible, avatarAnimal, avatarColor]);

  const isChanged = animal !== avatarAnimal || color.toLowerCase() !== avatarColor.toLowerCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.avatarModalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.avatarModalSheet} onStartShouldSetResponder={() => true}>
          <View style={styles.avatarModalHeader}>
            <Text style={styles.avatarModalTitle}>アイコンを選ぶ</Text>
            <TouchableOpacity onPress={onClose} style={styles.avatarModalCloseBtn}>
              <Text style={styles.avatarModalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 見本 */}
          <View style={styles.avatarPreviewRow}>
            <View style={[styles.avatarPreviewCircle, { backgroundColor: color }]}>
              <Image source={animalImageOf(animal)} style={styles.avatarPreviewImage} resizeMode="contain" />
            </View>
          </View>

          <Text style={styles.avatarSectionLabel}>動物</Text>
          <View style={styles.avatarGrid}>
            {AVATAR_ANIMALS.map((opt) => {
              const isSelected = animal === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.avatarOptionItem, isSelected && styles.avatarOptionItemSelected]}
                  onPress={() => setAnimal(opt.key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatarOptionCircle, { backgroundColor: color, borderColor: color }]}>
                    <Image source={opt.image} style={styles.avatarOptionImage} resizeMode="contain" />
                  </View>
                  <Text style={[styles.avatarOptionLabel, isSelected && styles.avatarOptionLabelSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.avatarSectionLabel}>色</Text>
          <View style={styles.avatarColorRow}>
            {AVATAR_COLORS.map((opt) => {
              const isSelected = color.toLowerCase() === opt.hex.toLowerCase();
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setColor(opt.hex)}
                  activeOpacity={0.7}
                  accessibilityLabel={opt.label}
                  style={[styles.avatarColorDotOuter, isSelected && { borderColor: opt.hex }]}
                >
                  <View style={[styles.avatarColorDot, { backgroundColor: opt.hex }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.avatarSaveBtn, !isChanged && styles.avatarSaveBtnDisabled]}
            onPress={() => onSelect(animal, color)}
            disabled={!isChanged}
            activeOpacity={0.85}
          >
            <Text style={styles.avatarSaveBtnText}>これにする</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
