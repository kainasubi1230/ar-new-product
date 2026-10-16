import React, { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Icons } from '../assets/icons';

type Props = {
  title: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  style?: ViewStyle;
  showTitleLogo?: boolean;
};

export function ScreenHeader({
  title,
  leftAction,
  rightAction,
  style,
  showTitleLogo = true,
}: Props): React.JSX.Element {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.sideContainer}>
        {leftAction ? (
          leftAction
        ) : showTitleLogo ? (
          <Image
            source={Icons.title}
            style={styles.titleLogo}
            resizeMode="contain"
          />
        ) : null}
      </View>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.sideContainer, styles.rightContainer]}>
        {rightAction}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  sideContainer: {
    minWidth: 72,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  titleLogo: {
    width: 60,
    height: 30,
  },
  rightContainer: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
