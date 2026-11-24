import { Dimensions, Platform, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

/** マイページ（とその部品）で使うスタイル */
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  settingsBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    width: 20,
    height: 20,
    tintColor: '#475569',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Profile Section & Avatar
  profileSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  avatarButton: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#10B981',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarEditBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  userName: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 2,
  },
  userBio: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 16,
  },

  // 3つのトグルカード（ポケット通知、関心タグのみ、安心フィルターで統一）
  filterToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  filterToggleCardOn: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  // 下に「見たくないジャンルの選択」がつながっているとき：下の角を四角にし、すき間をなくす
  filterToggleCardAttached: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    marginBottom: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  filterToggleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  filterToggleIconBoxOn: {
    backgroundColor: '#DCFCE7',
  },
  filterToggleIcon: {
    width: 20,
    height: 20,
    tintColor: '#64748B',
  },
  filterToggleIconOn: {
    tintColor: '#059669',
  },
  filterToggleTextGroup: {
    flex: 1,
    marginRight: 10,
  },
  filterToggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  filterToggleTitle: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  filterToggleTitleOn: {
    color: '#065F46',
    fontWeight: '800',
  },
  filterToggleDesc: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
  },

  // 安心フィルター除外設定カード
  // 安心フィルターのカードの下から引き出した続き（同じ色・同じ枠で、上の角は四角）
  mutedConfigCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#86EFAC',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 18,
    paddingBottom: 20,
    marginBottom: 14,
  },
  // 上のカードとの境目の細い線
  mutedConfigDivider: {
    height: 1,
    backgroundColor: '#BBF7D0',
    marginBottom: 18,
  },
  mutedConfigTitle: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  // 説明文を付けない見出し（下のすき間を説明文の分だけ取る）
  drawerTitleAlone: {
    marginBottom: 16,
  },
  mutedChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  mutedChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  mutedChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  mutedChipText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '600',
  },
  mutedChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mutedSelectedLabel: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  mutedSelectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  mutedActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 4,
  },
  mutedActiveBadgeText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },
  mutedRemoveBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // × の 2 本の線（丸の真ん中で交差させる）
  removeBar: {
    position: 'absolute',
    width: 8,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  removeBarA: {
    transform: [{ rotate: '45deg' }],
  },
  removeBarB: {
    transform: [{ rotate: '-45deg' }],
  },
  customMutedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    marginTop: 16,
  },
  customMutedInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: '#0F172A',
  },
  customMutedAddBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  customMutedAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // アバターモーダル
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  avatarModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarModalTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  avatarModalCloseBtn: {
    // 端に寄りすぎないよう、少し内側に
    marginRight: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarModalCloseText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  avatarOptionItem: {
    width: (width - 40 - 36) / 4,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  avatarOptionItemSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  avatarOptionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 4,
  },
  avatarOptionInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  avatarOptionLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  avatarOptionLabelSelected: {
    color: '#065F46',
    fontWeight: '800',
  },
  avatarOptionImage: {
    width: 36,
    height: 36,
  },
  // アイコンを選ぶ画面
  avatarPreviewRow: {
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarPreviewCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPreviewImage: {
    width: 64,
    height: 64,
  },
  avatarSectionLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  avatarColorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  avatarColorDotOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarSaveBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSaveBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  avatarSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  // マイページの大きいアイコンの動物
  avatarAnimalImage: {
    width: 66,
    height: 66,
  },

  // Footprint Summary Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    width: '100%',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statNumber: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },

  // 3 Main Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  tabSection: {
    marginBottom: 20,
  },

  // Sub Header & View Mode Toggle
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subHeaderFootprintIcon: {
    width: 16,
    height: 16,
    marginRight: 6,
    tintColor: '#10B981',
  },
  subSectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },

  // Placed Memory Cards
  // カードどうしの間はカードの下の余白で取る（削除したカードを畳むとき、すき間も一緒に畳まれるように）
  cardListContainer: {},

  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  tagToggleCard: {
    // 引き出しの中で 2 列（幅は入れ物に合わせる）
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  tagToggleCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  // アイコン・#タグ名・＋（✓）を 1 行に
  tagCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagIconWrapperActive: {
    backgroundColor: '#DCFCE7',
  },
  tagCardIconImage: {
    width: 18,
    height: 18,
    tintColor: '#64748B',
  },
  tagCardIconImageActive: {
    tintColor: '#059669',
  },
  tagCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagCheckCircleActive: {
    backgroundColor: '#10B981',
  },
  tagCheckSymbol: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  tagCardName: {
    flex: 1,
    marginHorizontal: 8,
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  tagCardNameActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // Empty State
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 20,
  },
  emptyFootprintsIcon: {
    width: 36,
    height: 36,
    marginBottom: 10,
    tintColor: '#94A3B8',
  },
  emptyStateText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyStateSub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  // Full-screen Auth on MyPage
  fullAuthContainer: {
    padding: 24,
    paddingTop: 36,
    paddingBottom: 48,
    alignItems: 'center',
  },
  authHero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  authHeroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  authHeroIcon: {
    width: 36,
    height: 36,
    tintColor: '#10B981',
  },
  authHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  authHeroSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  authTabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    width: '100%',
    maxWidth: 360,
    marginBottom: 24,
  },
  authTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  authTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  authTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  authTabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  authForm: {
    width: '100%',
    maxWidth: 360,
    gap: 16,
  },
  authField: {
    gap: 6,
  },
  authFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  authInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  authErrorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
  },
  authErrorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  authSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  authSubmitBtnDisabled: {
    opacity: 0.65,
  },
  authSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // タグを追加する入力欄の入れ物（見たくないジャンルの選択と同じく、区切り線なしで続ける）
  customInterestCard: {},
  customInterestAddBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
});
