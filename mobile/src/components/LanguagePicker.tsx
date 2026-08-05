// mobile/src/components/LanguagePicker.tsx
//
// A purpose-built picker for the language field in Create. Wraps the existing
// Chips component for visual consistency with other fields (genre, mood, etc),
// but adds a "More" / "Less" toggle so the language list can grow to 17+ entries
// without dominating the screen.
//
// Behavior:
//   - Shows the first N (default 7) languages as chips by default.
//   - Shows a single "More ▾" pill on the same row that, when tapped, expands
//     to show the full list. Tapping "Less ▴" collapses again.
//   - If the currently-selected value is in the hidden tier, the picker auto-
//     expands on mount so the user can see what's selected.

import React from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { theme } from '../theme';
import { Chips } from './Chips';

interface LanguagePickerProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  topCount?: number;
}

export function LanguagePicker<T extends string>({
  options,
  value,
  onChange,
  topCount = 7,
}: LanguagePickerProps<T>) {
  const top = options.slice(0, topCount);
  const rest = options.slice(topCount);

  // If the user's current value is in the "rest" tier, default to expanded so
  // they can see their selection. Without this, picking "Mandarin" then re-
  // navigating to Create would show the chips collapsed with no visible
  // selection — confusing.
  const initiallyExpanded = rest.length > 0 && rest.includes(value);
  const [expanded, setExpanded] = React.useState(initiallyExpanded);

  // If the active selection moves into the hidden tier later (e.g. via deep
  // link or programmatic change), keep it visible.
  React.useEffect(() => {
    if (rest.includes(value) && !expanded) setExpanded(true);
  }, [value, rest, expanded]);

  const visible = expanded ? options : top;

  return (
    <View style={styles.wrap}>
      <Chips options={visible} value={value} onChange={onChange} />
      {rest.length > 0 ? (
        <View style={styles.toggleRow}>
          <ToggleChip
            label={expanded ? 'Less ▴' : `More ▾  (${rest.length})`}
            onPress={() => setExpanded((v) => !v)}
          />
        </View>
      ) : null}
    </View>
  );
}

function ToggleChip({ label, onPress }: { label: string; onPress: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore web hover
      onHoverIn={() => setHovered(true)}
      // @ts-ignore web hover
      onHoverOut={() => setHovered(false)}
      style={[styles.toggle, hovered ? styles.toggleHover : null].filter(Boolean) as any}
    >
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  toggleRow: { flexDirection: 'row' },
  toggle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderStyle: 'dashed',
    ...(Platform.OS === 'web' ? ({ transition: 'all 150ms ease-out', cursor: 'pointer' } as any) : null),
  },
  toggleHover: {
    borderColor: theme.colors.magenta,
    backgroundColor: theme.colors.surface,
  },
  toggleText: {
    color: theme.colors.textDim,
    fontSize: 12,
    fontWeight: '500',
  },
});
