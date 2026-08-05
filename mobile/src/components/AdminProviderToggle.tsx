// mobile/src/components/AdminProviderToggle.tsx — NEW FILE
//
// Admin-only segmented control for picking the audio provider per-song.
// Self-gates: returns null for non-admins, so callers don't need to wrap
// in `{user.isAdmin && ...}`. Designed to be deletable when MiniMax becomes
// the default for everyone.
//
// Visual style intentionally mirrors the existing ModePicker in create.tsx
// for consistency (same surface, same selected gradient on web).

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { theme } from '../theme';

export type AudioProvider = 'suno' | 'minimax';

const OPTIONS: Array<{ id: AudioProvider; label: string; hint: string }> = [
  { id: 'suno', label: 'Suno', hint: 'browser adapter' },
  { id: 'minimax', label: 'MiniMax', hint: 'REST, no captcha' },
];

export function AdminProviderToggle({
  value,
  onChange,
}: {
  value: AudioProvider | undefined;
  onChange: (provider: AudioProvider) => void;
}) {
  const { user } = useAuth();

  // Hard gate: anyone who isn't admin sees nothing. Non-admin requests
  // will get the server's env-default provider regardless of any field
  // they manage to send (validator accepts it, service ignores it).
  if (!user?.isAdmin) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Audio provider</Text>
        <Text style={styles.adminBadge}>ADMIN</Text>
      </View>

      <View style={styles.tabs}>
        {OPTIONS.map((opt) => {
          const selected = value === opt.id;
          const webSelStyle =
            Platform.OS === 'web' && selected
              ? ({
                  backgroundImage:
                    'linear-gradient(135deg, #ff2d95 0%, #9d4edd 100%)',
                  backgroundColor: 'transparent',
                } as any)
              : null;

          return (
            <View
              key={opt.id}
              style={[styles.tab, selected ? styles.tabSelected : null, webSelStyle]}
              // @ts-ignore — onClick is web-only, RN ignores it
              onClick={() => onChange(opt.id)}
              onTouchEnd={() => onChange(opt.id)}
            >
              <Text
                style={[styles.tabLabel, selected ? styles.tabLabelSelected : null]}
              >
                {opt.label}
              </Text>
              <Text
                style={[styles.tabHint, selected ? styles.tabHintSelected : null]}
              >
                {opt.hint}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.help}>
        Visible to admins only. Non-admin users always get the server default.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  adminBadge: {
    color: theme.colors.magenta,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(255,45,149,0.12)',
    borderColor: 'rgba(255,45,149,0.3)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    gap: 2,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'all 150ms ease-out' } as any)
      : null),
  },
  tabSelected: {
    backgroundColor: theme.colors.magenta,
  },
  tabLabel: {
    color: theme.colors.textDim,
    fontSize: 13,
    fontWeight: '500',
  },
  tabLabelSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  tabHint: {
    color: theme.colors.muted,
    fontSize: 10,
  },
  tabHintSelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  help: {
    color: theme.colors.muted,
    fontSize: 11,
    fontStyle: 'italic',
  },
});
