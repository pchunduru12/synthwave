// mobile/src/components/UsageMeter.tsx — drop-in replacement
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from '../theme';

export function UsageMeter({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = Math.min(100, Math.round((current / Math.max(max, 0.001)) * 100));
  // Color shifts as we approach the cap.
  const fillColor = pct >= 90 ? theme.colors.danger : pct >= 70 ? theme.colors.warning : theme.colors.cyan;
  const webGradient = Platform.OS === 'web' && pct < 70 ? {
    backgroundImage: 'linear-gradient(90deg, #00e5ff 0%, #9d4edd 100%)',
  } as any : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          <Text style={styles.current}>${current.toFixed(2)}</Text>
          <Text style={styles.muted}> / ${max.toFixed(2)}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }, webGradient]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { color: theme.colors.text, fontWeight: '500', fontSize: 13 },
  value: { fontVariant: ['tabular-nums'] as any },
  current: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.muted, fontWeight: '400' },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
