import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AVATAR_ANIMALS,
  AVATAR_CANVAS_COLOR,
  AVATAR_COLOR_PRESETS,
  ORIGINAL_ACCENT_HEX,
  isOriginalAccent,
  type AvatarConfig,
  currentAttachmentsOf,
} from '../../config/avatarColors';
import {
  ATTACHMENT_CATEGORIES,
  AVATAR_ATTACHMENTS,
  attachmentKeysOf,
  attachmentOf,
  type AttachmentCategory,
} from '../../config/avatarAttachments';
import { AnimalAvatarImage } from '../AnimalAvatarImage';
import { ColorPicker } from './ColorPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 今のアバター（キャラクター・色・キャラクターごとのアタッチメント） */
  avatarConfig: AvatarConfig;
  /** 最後の段で「このアバターにする」を押したとき。作ったアバターがそのままアイコンになる */
  onSelect: (config: AvatarConfig) => void;
};

/**
 * 作る段の並び。1 段ずつ進む（キャラクター → 色 → アイテム → 確認）。
 * 背景などを足すときは、ここに 1 行足し、下の StepBody に、その段の中身を足す
 */
const AVATAR_STEPS = [
  { key: 'character', label: 'キャラクター', title: 'キャラクターをえらぶ' },
  { key: 'color', label: '色', title: '色をえらぶ' },
  { key: 'attachment', label: 'アイテム', title: 'アイテムをつける' },
  { key: 'confirm', label: 'かんせい', title: 'これでいい？' },
] as const;

type StepKey = (typeof AVATAR_STEPS)[number]['key'];

const PRESET_HEXES = AVATAR_COLOR_PRESETS.map((p) => p.hex);

// ほかの画面（マイページ・投稿画面）と同じ配色：薄いグレーの地に白いカード、アクセントはグリーン
const BG = '#F8FAFC';
const CARD_BORDER = '#E2E8F0';
const TEXT = '#0F172A';
const TEXT_SUB = '#64748B';
const MUTED = '#CBD5E1';
const GREEN = '#10B981';
const GREEN_SOFT = '#ECFDF5';
const GREEN_LINE = '#A7F3D0';

/** アバターをつくる：キャラクター → 色 → アイテム → 確認 と、1 段ずつ進む。上のプレビューは、どの段でもすぐ変わる */
export function AvatarPickerModal({ visible, onClose, avatarConfig, onSelect }: Props): React.JSX.Element {
  const [config, setConfig] = useState<AvatarConfig>(avatarConfig);
  const [stepIndex, setStepIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // 開くたびに、今のアバターから最初の段で始める（avatarConfig は親で毎回作り直されるので、開いたときだけ合わせる）
  useEffect(() => {
    if (visible) {
      setConfig(avatarConfig);
      setStepIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const step = AVATAR_STEPS[stepIndex];
  const isLast = stepIndex === AVATAR_STEPS.length - 1;
  const animalLabel = AVATAR_ANIMALS.find((a) => a.key === config.character)?.label ?? '';

  const goBack = () => (stepIndex === 0 ? onClose() : setStepIndex(stepIndex - 1));
  const goNext = () => (isLast ? onSelect(config) : setStepIndex(stepIndex + 1));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>アバターをつくる</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="閉じる">
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* いまどの段か（終わった段は押して戻れる） */}
        <View style={styles.stepper}>
          {AVATAR_STEPS.map((s, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <View style={[styles.stepLine, i <= stepIndex && styles.stepLineDone]} />}
                <TouchableOpacity
                  style={styles.stepItem}
                  onPress={() => setStepIndex(i)}
                  disabled={!isDone}
                  activeOpacity={0.7}
                >
                  <View style={[styles.stepDot, (isDone || isCurrent) && styles.stepDotActive]}>
                    <Text style={[styles.stepNumber, (isDone || isCurrent) && styles.stepNumberActive]}>
                      {isDone ? '✓' : i + 1}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>{s.label}</Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          scrollEnabled={!isDragging}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 大きなプレビュー（確認の段では、いちばん大きく） */}
          <View style={[styles.previewCard, step.key === 'confirm' ? styles.previewLarge : styles.previewNormal]}>
            <AnimalAvatarImage
              animal={config.character}
              color={config.color}
              attachments={currentAttachmentsOf(config)}
              style={styles.previewImage}
            />
          </View>

          <Text style={styles.stepTitle}>{step.title}</Text>
          <StepBody
            step={step.key}
            config={config}
            animalLabel={animalLabel}
            onChange={setConfig}
            onDraggingChange={setIsDragging}
          />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
            <Text style={styles.backText}>{stepIndex === 0 ? 'やめる' : 'もどる'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
            <Text style={styles.nextText}>{isLast ? 'このアバターにする' : 'つぎへ'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** 段ごとの中身 */
function StepBody({
  step,
  config,
  animalLabel,
  onChange,
  onDraggingChange,
}: {
  step: StepKey;
  config: AvatarConfig;
  animalLabel: string;
  onChange: (config: AvatarConfig) => void;
  onDraggingChange: (isDragging: boolean) => void;
}): React.JSX.Element {
  if (step === 'character') {
    // 4 列。今の色で出す
    return (
      <View style={styles.grid}>
        {AVATAR_ANIMALS.map((opt) => {
          const isSelected = config.character === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.gridCell}
              onPress={() => onChange({ ...config, character: opt.key })}
              activeOpacity={0.75}
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[styles.gridItem, isSelected && styles.gridItemSelected]}>
                <AnimalAvatarImage
                  animal={opt.key}
                  color={config.color}
                  attachments={attachmentKeysOf(config.attachments[opt.key])}
                  style={styles.gridImage}
                />
              </View>
              <Text style={[styles.gridLabel, isSelected && styles.gridLabelSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  if (step === 'color') {
    const setColor = (hex: string) => onChange({ ...config, color: hex.toUpperCase() });
    return (
      <View style={styles.colorCard}>
        <ColorPicker
          value={config.color}
          onChange={setColor}
          quickColors={PRESET_HEXES}
          onDraggingChange={onDraggingChange}
        />
        {/* いちばん下に、はじめの色に戻すボタン */}
        <TouchableOpacity
          style={[styles.resetBtn, isOriginalAccent(config.color) && styles.resetBtnDisabled]}
          onPress={() => setColor(ORIGINAL_ACCENT_HEX)}
          disabled={isOriginalAccent(config.color)}
          activeOpacity={0.7}
        >
          <Text style={styles.resetText}>初期カラーに戻す</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'attachment') {
    return <AttachmentStep config={config} onChange={onChange} />;
  }

  // 確認：選んだものの一覧
  const attachmentLabels = currentAttachmentsOf(config).map((key) => attachmentOf(key).label);
  return (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryKey}>キャラクター</Text>
        <Text style={styles.summaryValue}>{animalLabel}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryKey}>色</Text>
        <View style={styles.summaryColor}>
          <View style={[styles.summarySwatch, { backgroundColor: config.color }]} />
          <Text style={styles.summaryValue}>
            {isOriginalAccent(config.color) ? 'はじめのオレンジ' : config.color.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryKey}>アイテム</Text>
        <Text style={[styles.summaryValue, styles.summaryValueWrap]}>
          {attachmentLabels.length > 0 ? attachmentLabels.join('・') : 'なし'}
        </Text>
      </View>
    </View>
  );
}

/**
 * アイテムの段：リボン・帽子・メガネのタブと、そのカテゴリのアイテム一覧（4 列）。
 * 押すと付く（同じカテゴリの前のものと入れ替わる）、付いているものをもう一度押すと外れる。装着は今のキャラクターごと
 */
function AttachmentStep({
  config,
  onChange,
}: {
  config: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
}): React.JSX.Element {
  const [category, setCategory] = useState<AttachmentCategory>('ribbon');
  const selection = config.attachments[config.character] ?? {};

  const toggle = (key: (typeof AVATAR_ATTACHMENTS)[number]['key']) => {
    const next = { ...selection };
    if (next[category] === key) {
      delete next[category];
    } else {
      next[category] = key;
    }
    onChange({ ...config, attachments: { ...config.attachments, [config.character]: next } });
  };

  return (
    <View>
      <View style={styles.tabs}>
        {ATTACHMENT_CATEGORIES.map((c) => {
          const isActive = c.key === category;
          const isWorn = !!selection[c.key];
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setCategory(c.key)}
              activeOpacity={0.8}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{c.label}</Text>
              {/* 付けているカテゴリには小さな点 */}
              {isWorn && <View style={[styles.tabDot, isActive && styles.tabDotActive]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.grid}>
        {AVATAR_ATTACHMENTS.filter((a) => a.category === category).map((item) => {
          const isSelected = selection[category] === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.gridCell}
              onPress={() => toggle(item.key)}
              activeOpacity={0.75}
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[styles.itemTile, isSelected && styles.gridItemSelected]}>
                <Image source={item.image} style={styles.itemImage} resizeMode="contain" />
                {isSelected && (
                  <View style={styles.itemCheck}>
                    <Text style={styles.itemCheckText}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.gridLabel, isSelected && styles.gridLabelSelected]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.itemHint}>もう一度押すと外せます</Text>
    </View>
  );
}

// 白いカードの薄い影（マイページのカードと同じ）
const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
    paddingBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '800', color: TEXT },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 6,
  },
  stepItem: { alignItems: 'center', gap: 4, width: 66 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: MUTED,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { borderColor: GREEN, backgroundColor: GREEN },
  stepNumber: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },
  stepNumberActive: { color: '#FFFFFF' },
  stepLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  stepLabelCurrent: { color: '#059669', fontWeight: '800' },
  stepLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: CARD_BORDER, marginTop: 12, marginHorizontal: -18 },
  stepLineDone: { backgroundColor: GREEN },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  previewCard: {
    alignSelf: 'center',
    aspectRatio: 1,
    borderRadius: 24,
    backgroundColor: AVATAR_CANVAS_COLOR,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
    marginTop: 10,
  },
  previewNormal: { width: '68%', maxWidth: 260 },
  previewLarge: { width: '100%', maxWidth: 340 },
  previewImage: { width: '100%', height: '100%' },
  stepTitle: { fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center', marginTop: 18, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  gridCell: { width: '25%', alignItems: 'center', gap: 5, paddingHorizontal: 5 },
  gridItem: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: AVATAR_CANVAS_COLOR,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  gridItemSelected: { borderWidth: 2.5, borderColor: GREEN },
  gridImage: { width: '100%', height: '100%' },
  gridLabel: { fontSize: 12, fontWeight: '600', color: TEXT_SUB },
  gridLabelSelected: { color: '#059669', fontWeight: '800' },
  colorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    padding: 16,
    ...cardShadow,
  },
  resetBtn: {
    alignSelf: 'center',
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: GREEN_SOFT,
    borderWidth: 1.5,
    borderColor: GREEN_LINE,
  },
  resetBtnDisabled: { opacity: 0.4 },
  resetText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  summary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    paddingHorizontal: 18,
    paddingVertical: 4,
    ...cardShadow,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  summaryDivider: { height: 1, backgroundColor: '#F1F5F9' },
  summaryKey: { fontSize: 13, fontWeight: '600', color: TEXT_SUB },
  summaryValue: { fontSize: 15, fontWeight: '800', color: '#334155', fontVariant: ['tabular-nums'] },
  summaryValueWrap: { flexShrink: 1, textAlign: 'right', marginLeft: 16 },
  summaryColor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summarySwatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CARD_BORDER },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 11,
  },
  tabActive: { backgroundColor: '#FFFFFF', ...cardShadow },
  tabText: { fontSize: 13, fontWeight: '700', color: TEXT_SUB },
  tabTextActive: { color: '#059669', fontWeight: '800' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: MUTED },
  tabDotActive: { backgroundColor: GREEN },
  itemTile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // アイテムの絵は 512 の中の真ん中 半分くらいにあるので、マスいっぱいより少し大きく出す
  itemImage: { width: '150%', height: '150%' },
  itemCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  itemHint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 14 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    // ホームインジケーターの分も空ける（pageSheet の下端は画面の下端と同じ）
    paddingBottom: 34,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  backBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  backText: { color: '#475569', fontSize: 15, fontWeight: '700' },
  nextBtn: {
    flex: 2,
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
