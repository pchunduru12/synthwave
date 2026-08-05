import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

export function ModeCard({
  title,
  description,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.pill, selected && styles.pillSelected]}>
          <Text style={styles.pillText}>{selected ? 'Selected' : 'Choose'}</Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardSelected: {
    borderColor: theme.colors.accent2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1d1d34',
  },
  pillSelected: {
    backgroundColor: theme.colors.accent,
  },
  pillText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
