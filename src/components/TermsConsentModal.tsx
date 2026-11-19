import React from 'react';
import { Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIVACY_URL, TERMS_URL } from '../config/legal';

type Props = {
  visible: boolean;
  /** 「同意して続ける」 */
  onAgree: () => void;
  onCancel: () => void;
};

// 利用規約（terms.html）の「不適切な投稿の禁止」と同じ内容
const RULES = [
  '他人を傷つける・差別する・脅す・嫌がらせをする言葉',
  '暴力的・性的な言葉',
  '住所や電話番号など、自分や他人を特定できる情報',
  '犯罪や危険な行為をすすめる言葉',
  '他人の権利（著作権・肖像権・プライバシー）を侵す言葉',
  '宣伝・勧誘・スパム',
];

/**
 * 言葉を置く前の、利用規約への同意（App Store のガイドライン 1.2）。
 * 初めて置くとき（と、規約を改定したとき）だけ出す
 */
export function TermsConsentModal({ visible, onAgree, onCancel }: Props): React.JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>利用規約への同意</Text>
            <Text style={styles.lead}>
              Loca は、誰もが安心して言葉に出会える場所を目指しています。言葉を置く前に、次のような言葉を置かないことを約束してください。
            </Text>

            <View style={styles.rules}>
              {RULES.map((rule) => (
                <View key={rule} style={styles.ruleRow}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.note}>
              不適切な言葉は通報でき、運営が確認して 24 時間以内に削除します。規約に反した方は、利用を止めることがあります。
            </Text>

            {(TERMS_URL !== '' || PRIVACY_URL !== '') && (
              <View style={styles.links}>
                {TERMS_URL !== '' && (
                  <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
                    利用規約をすべて読む
                  </Text>
                )}
                {PRIVACY_URL !== '' && (
                  <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
                    プライバシーポリシー
                  </Text>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.agreeButton} onPress={onAgree} activeOpacity={0.85}>
            <Text style={styles.agreeText}>同意して続ける</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.6}>
            <Text style={styles.cancelText}>やめる</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  title: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  lead: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  rules: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 14,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 7,
    marginRight: 10,
  },
  ruleText: {
    flex: 1,
    color: '#065F46',
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 6,
  },
  link: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  agreeButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  agreeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
});
