// mobile/app/(tabs)/usage.tsx — drop-in replacement
import React from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { UsageMeter } from '../../src/components/UsageMeter';

type UsageResponse = {
  dailyUsd: number;
  monthlyUsd: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  budgets: { dailySoftLimitUsd: number; dailyHardLimitUsd: number; monthlyHardLimitUsd: number };
  events: Array<{ id: string; category: string; provider: string; model: string; costUsd: number; createdAt: string }>;
};

export default function UsageScreen() {
  const { token } = useAuth();
  const [usage, setUsage] = React.useState<UsageResponse | null>(null);
  const [dailySoft, setDailySoft] = React.useState('');
  const [dailyHard, setDailyHard] = React.useState('');
  const [monthlyHard, setMonthlyHard] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await api<UsageResponse>('/v1/usage/me', {}, token || undefined);
    setUsage(result);
    setDailySoft(String(result.budgets.dailySoftLimitUsd));
    setDailyHard(String(result.budgets.dailyHardLimitUsd));
    setMonthlyHard(String(result.budgets.monthlyHardLimitUsd));
  }, [token]);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  const save = async () => {
    try {
      setSaving(true);
      await api('/v1/usage/budgets', {
        method: 'PATCH',
        body: JSON.stringify({
          dailySoftLimitUsd: Number(dailySoft),
          dailyHardLimitUsd: Number(dailyHard),
          monthlyHardLimitUsd: Number(monthlyHard),
        }),
      }, token || undefined);
      await load();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (error: any) {
      if (Platform.OS === 'web') window.alert(`Save failed: ${error.message}`);
      else Alert.alert('Save failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBanner = usage?.hardLimitReached
    ? { color: theme.colors.danger, text: 'Hard limit reached — new creations will be rejected.' }
    : usage?.softLimitReached
      ? { color: theme.colors.warning, text: 'Soft limit reached — heads up.' }
      : { color: theme.colors.success, text: 'Within budget.' };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Usage & budgets</Text>
        <Text style={styles.subtitle}>Caps protect you from runaway spend on the providers.</Text>
      </View>

      {usage ? (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusBanner.color }]} />
            <Text style={[styles.statusText, { color: statusBanner.color }]}>{statusBanner.text}</Text>
          </View>
          <View style={styles.metersWrap}>
            <UsageMeter label="Today" current={usage.dailyUsd} max={usage.budgets.dailyHardLimitUsd} />
            <UsageMeter label="This month" current={usage.monthlyUsd} max={usage.budgets.monthlyHardLimitUsd} />
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Budget settings (USD)</Text>
        <View style={styles.fieldGrid}>
          <BudgetField label="Daily soft" value={dailySoft} onChangeText={setDailySoft} hint="Warning at this point" />
          <BudgetField label="Daily hard" value={dailyHard} onChangeText={setDailyHard} hint="Block new jobs above this" />
          <BudgetField label="Monthly hard" value={monthlyHard} onChangeText={setMonthlyHard} hint="Hard cap for the month" />
        </View>
        <View style={styles.saveRow}>
          <Button label={savedFlash ? 'Saved ✓' : 'Save budgets'} onPress={save} loading={saving} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recent events</Text>
        {usage?.events && usage.events.length > 0 ? (
          <View style={styles.eventsList}>
            {usage.events.slice(0, 50).map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventLeft}>
                  <Text style={styles.eventCategory}>{event.category}</Text>
                  <Text style={styles.eventProvider}>{event.provider}/{event.model}</Text>
                </View>
                <View style={styles.eventRight}>
                  <Text style={styles.eventCost}>${event.costUsd.toFixed(3)}</Text>
                  <Text style={styles.eventTime}>{new Date(event.createdAt).toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No usage events yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function BudgetField({ label, value, onChangeText, hint }: { label: string; value: string; onChangeText: (v: string) => void; hint: string }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Text style={styles.dollar}>$</Text>
        <TextInput
          style={[styles.input, focused ? styles.inputFocused : null]}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.colors.muted}
        />
      </View>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxxl, gap: theme.space.lg, maxWidth: 960, alignSelf: 'center', width: '100%' },
  header: { gap: theme.space.xs },
  title: { ...theme.type.h1, color: theme.colors.text },
  subtitle: { color: theme.colors.muted, fontSize: 13 },
  card: {
    backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.md,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)' } as any) : null),
  },
  cardLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '500' },
  metersWrap: { gap: theme.space.md, marginTop: 4 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  fieldBlock: { flex: 1, minWidth: 180, gap: 6 },
  fieldLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingLeft: 12 },
  dollar: { color: theme.colors.muted, fontSize: 14, marginRight: 4 },
  input: {
    flex: 1, color: theme.colors.text, paddingVertical: 12, paddingRight: 12, fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  inputFocused: {},
  fieldHint: { color: theme.colors.muted, fontSize: 11 },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: theme.space.sm },
  eventsList: { gap: 2 },
  eventRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomColor: theme.colors.border, borderBottomWidth: 1,
  },
  eventLeft: { gap: 2 },
  eventCategory: { color: theme.colors.text, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  eventProvider: { color: theme.colors.muted, fontSize: 11 },
  eventRight: { alignItems: 'flex-end', gap: 2 },
  eventCost: { color: theme.colors.cyan, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as any },
  eventTime: { color: theme.colors.muted, fontSize: 11 },
  empty: { color: theme.colors.muted, fontSize: 13, fontStyle: 'italic' },
});
