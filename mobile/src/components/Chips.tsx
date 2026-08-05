// mobile/src/components/Chips.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { theme } from '../theme';

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  formatLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (option: T) => string;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Chip
            key={String(option)}
            label={formatLabel ? formatLabel(option) : String(option)}
            selected={selected}
            onPress={() => onChange(option)}
          />
        );
      })}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);

  const webSelectedStyle = Platform.OS === 'web' && selected ? {
    backgroundImage: 'linear-gradient(135deg, #ff2d95 0%, #9d4edd 100%)',
    backgroundColor: 'transparent',
    boxShadow: '0 0 12px rgba(255,45,149,0.35)',
  } as any : null;

  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore web hover
      onHoverIn={() => setHovered(true)}
      // @ts-ignore web hover
      onHoverOut={() => setHovered(false)}
      style={[
        styles.chip,
        selected ? styles.chipSelected : null,
        hovered && !selected ? styles.chipHover : null,
        webSelectedStyle,
      ].filter(Boolean) as any}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  chip: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: theme.space.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    ...(Platform.OS === 'web' ? ({ transition: 'all 200ms ease-out', cursor: 'pointer' } as any) : null),
  },
  chipHover: {
    backgroundColor: theme.colors.raised,
    borderColor: theme.colors.borderStrong,
  },
  chipSelected: {
    backgroundColor: theme.colors.magenta,
    borderColor: theme.colors.magenta,
  },
  chipText: { color: theme.colors.textDim, fontSize: 13, fontWeight: '500' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  label: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: theme.space.sm,
  },
});
