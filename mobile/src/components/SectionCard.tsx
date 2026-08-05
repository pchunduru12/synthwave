// mobile/src/components/SectionCard.tsx — drop-in replacement
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, Platform } from 'react-native';
import { theme } from '../theme';

export function SectionCard({
  title,
  subtitle,
  children,
  style,
  accent,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /** When true, draws a magenta→cyan top stripe — used for the "important" card on a screen */
  accent?: boolean;
}) {
  const webGradient = Platform.OS === 'web' ? {
    backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)',
    backgroundColor: 'transparent',
  } as any : null;

  return (
    <View style={[styles.card, webGradient, style]}>
      {accent ? <View style={styles.accentStripe} /> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  accentStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(90deg, #ff2d95 0%, #9d4edd 50%, #00e5ff 100%)' } as any)
      : { backgroundColor: theme.colors.magenta }),
  },
  title: { ...theme.type.h2, color: theme.colors.text },
  subtitle: { ...theme.type.small, color: theme.colors.muted },
  body: { gap: theme.space.md },
});
