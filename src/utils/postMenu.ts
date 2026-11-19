import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { REPORT_REASONS } from '../services/moderationService';

/**
 * 他の人の言葉のメニュー（通報・ブロック）。AR のカードの長押しと、探索画面のカードの「…」から出す
 */
export const openPostMenu = ({
  authorName,
  onReport,
  onBlock,
}: {
  authorName: string;
  onReport: (reason: string) => void;
  onBlock: () => void;
}) => {
  const reportLabel = 'この言葉を通報する';
  const blockLabel = `${authorName}さんをブロック`;
  choose('この言葉について', [reportLabel, blockLabel], (picked) => {
    if (picked === reportLabel) chooseReason(onReport);
    if (picked === blockLabel) confirmBlock(authorName, onBlock);
  });
};

const chooseReason = (onReport: (reason: string) => void) => {
  choose('通報の理由', REPORT_REASONS, (reason) => onReport(reason));
};

const confirmBlock = (authorName: string, onBlock: () => void) => {
  Alert.alert(
    `${authorName}さんをブロック`,
    `${authorName}さんの言葉は、あなたの画面に表示されなくなります。相手に知らされることはありません。`,
    [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ブロックする', style: 'destructive', onPress: onBlock },
    ]
  );
};

// iOS は下から出るメニュー、それ以外はダイアログで選ぶ
const choose = (title: string, options: string[], onPick: (option: string) => void) => {
  if (Platform.OS === 'ios') {
    const all = [...options, 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: all, cancelButtonIndex: all.length - 1 },
      (index) => {
        if (index < options.length) onPick(options[index]);
      }
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((option) => ({ text: option, onPress: () => onPick(option) })),
    { text: 'キャンセル', style: 'cancel' as const },
  ]);
};
