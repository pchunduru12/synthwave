// mobile/app/(tabs)/profile.tsx — drop-in replacement
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  const initials = (user?.displayName || user?.email || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.displayName || 'You'}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Plan</Text>
            <Text style={styles.statValue}>{user?.plan || 'free'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Credits</Text>
            <Text style={styles.statValue}>{user?.creditsRemaining ?? 0}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tipsCard}>
        <Text style={styles.cardLabel}>Tips for testers</Text>
        <Text style={styles.bullet}>• Balanced is the recommended default — best quality-per-cost.</Text>
        <Text style={styles.bullet}>• Use Economy for quick experiments and prompt iterations.</Text>
        <Text style={styles.bullet}>• Reserve Premium for songs you actually want to share.</Text>
        <Text style={styles.bullet}>• A creation usually takes 60–120 seconds end to end.</Text>
      </View>

      <View style={styles.dangerZone}>
        <Button label="Log out" variant="danger" onPress={logout} fullWidth />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxxl, gap: theme.space.lg, maxWidth: 720, alignSelf: 'center', width: '100%' },
  profileCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.xl,
    alignItems: 'center',
    gap: theme.space.sm,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)' } as any) : null),
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.magenta,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, #ff2d95 0%, #00e5ff 100%)' } as any) : null),
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { color: theme.colors.text, fontSize: 20, fontWeight: '600', marginTop: theme.space.sm },
  email: { color: theme.colors.muted, fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.space.md },
  statBlock: { paddingHorizontal: theme.space.lg, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: theme.colors.border },
  statLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { color: theme.colors.text, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  tipsCard: {
    backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg, padding: theme.space.lg, gap: 6,
  },
  cardLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  bullet: { color: theme.colors.textDim, fontSize: 14, lineHeight: 22 },
  dangerZone: { marginTop: theme.space.lg },
});
