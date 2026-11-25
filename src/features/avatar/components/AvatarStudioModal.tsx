import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AvatarSvg } from '../AvatarSvg';
import { saveAvatarConfig, useAvatarConfig } from '../avatarStore';
import { AVATAR_CHARACTERS, AVATAR_ROLE_LABELS, defaultColorsOf, usedRolesOf } from '../characters';
import { readableTextOn } from '../color';
import { AVATAR_COLOR_PRESETS } from '../presets';
import { AVATAR_COLOR_ROLES, type AvatarCharacterKey, type AvatarColorRole, type AvatarConfig } from '../types';
import { ColorPicker } from './ColorPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const WIDE_BREAKPOINT = 720;
const ACCENT = '#10B981';

/**
 * アバターを作る画面：キャラクターを選んで、5 つのパーツの色を変える。
 * 編集中は下書き（draft）を触り、「保存する」で端末に保存する。キャラクターごとの色は下書きの中で別々に持つ。
 */
export function AvatarStudioModal({ visible, onClose }: Props): React.JSX.Element {
  const { config: saved } = useAvatarConfig();
  const [draft, setDraft] = useState<AvatarConfig>(saved);
  const [role, setRole] = useState<AvatarColorRole>('ink');
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  // 開くたびに、保存してあるアバターから始める
  useEffect(() => {
    if (visible) {
      setDraft(saved);
      setRole('ink');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const character = draft.character;
  const colors = draft.colorsByCharacter[character];
  const usedRoles = usedRolesOf(character);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const selectCharacter = (key: AvatarCharacterKey) => setDraft((d) => ({ ...d, character: key }));

  const setRoleColor = (target: AvatarColorRole, hex: string) =>
    setDraft((d) => ({
      ...d,
      colorsByCharacter: { ...d.colorsByCharacter, [d.character]: { ...d.colorsByCharacter[d.character], [target]: hex } },
    }));

  const applyColors = (next: AvatarConfig['colorsByCharacter'][AvatarCharacterKey]) =>
    setDraft((d) => ({ ...d, colorsByCharacter: { ...d.colorsByCharacter, [d.character]: { ...next } } }));

  const resetPart = () => setRoleColor(role, defaultColorsOf(character)[role]);
  const resetAll = () => applyColors(defaultColorsOf(character));

  const handleSave = () => {
    saveAvatarConfig(draft);
    onClose();
  };

  const handleClose = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert('保存せずに閉じますか？', '変えた色やキャラクターは元に戻ります', [
      { text: 'つづける', style: 'cancel' },
      { text: '閉じる', style: 'destructive', onPress: onClose },
    ]);
  };

  const previewWidth = isWide ? Math.min(width * 0.4, 420) : Math.min(width * 0.62, height * 0.3, 300);

  const preview = (
    <View style={[styles.previewCard, isWide ? styles.previewCardWide : null]}>
      {/* ポップな水玉（今の色で） */}
      <View style={[styles.dot, { top: 18, left: 22, backgroundColor: colors.accent }]} />
      <View style={[styles.dot, styles.dotSmall, { top: 54, right: 30, backgroundColor: colors.secondary }]} />
      <View style={[styles.dot, styles.dotSmall, { bottom: 26, left: 40, backgroundColor: colors.base }]} />
      <View style={[styles.dot, { bottom: 40, right: 22, backgroundColor: colors.ink, opacity: 0.18 }]} />
      <AvatarSvg character={character} colors={colors} width={previewWidth} />
      <View style={styles.nameTag}>
        <Text style={styles.nameTagText}>{AVATAR_CHARACTERS.find((c) => c.key === character)?.label}</Text>
      </View>
    </View>
  );

  const controls = (
    <>
      {/* キャラクター */}
      <Text style={styles.sectionTitle}>キャラクター</Text>
      <View style={styles.characterGrid}>
        {AVATAR_CHARACTERS.map((c) => {
          const selected = c.key === character;
          return (
            <TouchableOpacity
              key={c.key}
              activeOpacity={0.8}
              onPress={() => selectCharacter(c.key)}
              style={[styles.characterTile, selected && styles.characterTileSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={c.label}
            >
              <AvatarSvg character={c.key} colors={draft.colorsByCharacter[c.key]} width={52} />
              <Text style={[styles.characterLabel, selected && styles.characterLabelSelected]}>{c.label}</Text>
              {selected && (
                <View style={styles.checkBadge}>
                  <Text style={styles.checkBadgeText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 色 */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>いろ</Text>
        <TouchableOpacity onPress={resetAll} activeOpacity={0.7} style={styles.resetAllBtn}>
          <Text style={styles.resetAllText}>↺ 初期カラーに戻す</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.roleRow}>
        {AVATAR_COLOR_ROLES.map((r) => {
          const selected = r === role;
          const unused = !usedRoles.includes(r);
          return (
            <TouchableOpacity
              key={r}
              activeOpacity={0.8}
              onPress={() => setRole(r)}
              style={[styles.roleChip, selected && styles.roleChipSelected, unused && styles.roleChipUnused]}
            >
              <View style={[styles.roleSwatch, { backgroundColor: colors[r] }]} />
              <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{AVATAR_ROLE_LABELS[r].label}</Text>
              <Text style={styles.roleSub}>{AVATAR_ROLE_LABELS[r].sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.pickerCard}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>
            {AVATAR_ROLE_LABELS[role].label}カラー
            <Text style={styles.pickerVar}>  --avatar-{role}</Text>
          </Text>
          <TouchableOpacity onPress={resetPart} activeOpacity={0.7}>
            <Text style={styles.resetPartText}>このいろだけ戻す</Text>
          </TouchableOpacity>
        </View>
        {!usedRoles.includes(role) && (
          <Text style={styles.unusedNote}>このキャラクターの絵には、このパーツがありません（色は覚えておきます）</Text>
        )}
        <ColorPicker value={colors[role]} onChange={(hex) => setRoleColor(role, hex)} />
      </View>

      <Text style={styles.sectionTitle}>カラープリセット</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
        {AVATAR_COLOR_PRESETS.map((p) => (
          <TouchableOpacity key={p.key} activeOpacity={0.8} onPress={() => applyColors(p.colors)} style={styles.presetCard}>
            <View style={styles.presetStripes}>
              {AVATAR_COLOR_ROLES.map((r) => (
                <View key={r} style={[styles.presetStripe, { backgroundColor: p.colors[r] }]} />
              ))}
            </View>
            <Text style={styles.presetLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleClose}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn} activeOpacity={0.7}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>アバターをつくる</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!isDirty}
            style={[styles.saveBtn, !isDirty && styles.saveBtnDisabled]}
            activeOpacity={0.85}
          >
            <Text style={[styles.saveText, { color: readableTextOn(isDirty ? ACCENT : '#CBD5E1') }]}>保存する</Text>
          </TouchableOpacity>
        </View>

        {isWide ? (
          <View style={styles.wideBody}>
            <View style={styles.widePreview}>{preview}</View>
            <ScrollView style={styles.wideControls} contentContainerStyle={styles.controlsContent}>
              {controls}
            </ScrollView>
          </View>
        ) : (
          <>
            <View style={styles.narrowPreview}>{preview}</View>
            <ScrollView contentContainerStyle={styles.controlsContent} keyboardShouldPersistTaps="handled">
              {controls}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF9F0' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 14 : 18,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F1E6D6',
  },
  headerClose: { fontSize: 16, fontWeight: '800', color: '#64748B' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  saveBtnDisabled: { backgroundColor: '#CBD5E1' },
  saveText: { fontSize: 14, fontWeight: '900' },

  narrowPreview: { paddingHorizontal: 16, paddingBottom: 8 },
  wideBody: { flex: 1, flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  widePreview: { flex: 1, justifyContent: 'center' },
  wideControls: { width: 400, flexGrow: 0 },
  controlsContent: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },

  previewCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F1E6D6',
    overflow: 'hidden',
  },
  previewCardWide: { flex: 1 },
  dot: { position: 'absolute', width: 34, height: 34, borderRadius: 17, opacity: 0.55 },
  dotSmall: { width: 18, height: 18, borderRadius: 9 },
  nameTag: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  nameTagText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#1E293B', marginTop: 4 },
  resetAllBtn: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: '#F1E6D6' },
  resetAllText: { fontSize: 12, fontWeight: '800', color: '#64748B' },

  characterGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  characterTile: {
    width: '23%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F1E6D6',
  },
  characterTileSelected: { borderColor: ACCENT, backgroundColor: '#ECFDF5', transform: [{ scale: 1.04 }] },
  characterLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },
  characterLabelSelected: { color: '#047857', fontWeight: '900' },
  checkBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  checkBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },

  roleRow: { flexDirection: 'row', gap: 6 },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F1E6D6',
  },
  roleChipSelected: { borderColor: '#1E293B' },
  roleChipUnused: { opacity: 0.5 },
  roleSwatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#E2E8F0', marginBottom: 4 },
  roleLabel: { fontSize: 11, fontWeight: '800', color: '#475569' },
  roleLabelSelected: { color: '#1E293B', fontWeight: '900' },
  roleSub: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },

  pickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    gap: 10,
    borderWidth: 3,
    borderColor: '#F1E6D6',
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 15, fontWeight: '900', color: '#1E293B' },
  pickerVar: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  resetPartText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  unusedNote: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  presetRow: { gap: 10, paddingVertical: 2 },
  presetCard: {
    width: 84,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#F1E6D6',
  },
  presetStripes: { flexDirection: 'row', width: 60, height: 28, borderRadius: 10, overflow: 'hidden' },
  presetStripe: { flex: 1 },
  presetLabel: { fontSize: 12, fontWeight: '800', color: '#475569' },
});
