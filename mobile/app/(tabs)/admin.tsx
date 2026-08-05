// mobile/app/(tabs)/admin.tsx — drop-in replacement
import React from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';

type InvitesResponse = { invites: string[] };

type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  plan: string;
  creditsRemaining: number;
  createdAt: string;
  disabled: boolean;
  isAdmin: boolean;
  creationCount: number;
  totalSpentUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type UsersResponse = {
  users: AdminUserRow[];
  totals: {
    userCount: number;
    creationCount: number;
    totalSpentUsd: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export default function AdminScreen() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [invites, setInvites] = React.useState<string[]>([]);
  const [users, setUsers] = React.useState<AdminUserRow[]>([]);
  const [totals, setTotals] = React.useState<UsersResponse['totals'] | null>(null);
  const [newInviteEmail, setNewInviteEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (user && !user.isAdmin) router.replace('/');
  }, [user, router]);

  const load = React.useCallback(async () => {
    if (!token) return;
    const [inv, usr] = await Promise.all([
      api<InvitesResponse>('/v1/admin/invites', {}, token),
      api<UsersResponse>('/v1/admin/users', {}, token),
    ]);
    setInvites(inv.invites);
    setUsers(usr.users);
    setTotals(usr.totals);
  }, [token]);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  const showError = (message: string) => {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('Error', message);
  };

  const addInvite = async () => {
    const email = newInviteEmail.trim();
    if (!email) return;
    try {
      setBusy(true);
      const result = await api<InvitesResponse>('/v1/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }, token || undefined);
      setInvites(result.invites);
      setNewInviteEmail('');
    } catch (error: any) {
      showError(`Add invite failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeInvite = async (email: string) => {
    try {
      setBusy(true);
      const result = await api<InvitesResponse>(
        `/v1/admin/invites/${encodeURIComponent(email)}`,
        { method: 'DELETE' },
        token || undefined,
      );
      setInvites(result.invites);
    } catch (error: any) {
      showError(`Remove invite failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleDisabled = async (row: AdminUserRow) => {
    const action = row.disabled ? 'enable' : 'disable';
    try {
      setBusy(true);
      await api(`/v1/admin/users/${row.id}/${action}`, { method: 'POST' }, token || undefined);
      await load();
    } catch (error: any) {
      showError(`${action} failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.subtitle}>Manage users, invite access, spend, and token usage.</Text>
      </View>

      {totals ? (
        <View style={styles.statsRow}>
          <Stat label="Users" value={String(totals.userCount)} />
          <Stat label="Creations" value={String(totals.creationCount)} />
          <Stat label="Total spend" value={`$${totals.totalSpentUsd.toFixed(2)}`} />
          <Stat label="Tokens" value={formatNumber(totals.totalTokens)} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Invite a new user</Text>
        <Text style={styles.help}>
          Adding an email here lets that address register on the site. Send the
          invite link to them yourself — there's no email automation yet.
        </Text>
        <View style={styles.addRow}>
          <TextInput
            value={newInviteEmail}
            onChangeText={setNewInviteEmail}
            placeholder="someone@example.com"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Button label="Add" onPress={addInvite} loading={busy} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Allowlist ({invites.length})</Text>
        {invites.length === 0 ? (
          <Text style={styles.help}>No emails yet. Anyone can register until you add one.</Text>
        ) : (
          invites.map((email) => (
            <View key={email} style={styles.listRow}>
              <Text style={styles.listText}>{email}</Text>
              <Button label="Remove" variant="ghost" onPress={() => void removeInvite(email)} />
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Users ({users.length})</Text>
        {users.length === 0 ? (
          <Text style={styles.help}>No users yet.</Text>
        ) : (
          users.map((row) => (
            <View key={row.id} style={styles.userRow}>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>
                  {row.displayName}
                  {row.isAdmin ? <Text style={styles.adminBadge}>  ADMIN</Text> : null}
                  {row.disabled ? <Text style={styles.disabledBadge}>  DISABLED</Text> : null}
                </Text>
                <Text style={styles.userEmail}>{row.email}</Text>
                <Text style={styles.userMeta}>
                  {row.creationCount} creation{row.creationCount === 1 ? '' : 's'} · ${row.totalSpentUsd.toFixed(2)} spent · {formatNumber(row.totalTokens)} tokens · joined {formatDate(row.createdAt)}
                </Text>
                <Text style={styles.userTokenMeta}>
                  Input {formatNumber(row.inputTokens)} · Output {formatNumber(row.outputTokens)}
                </Text>
              </View>
              {!row.isAdmin ? (
                <Button
                  label={row.disabled ? 'Enable' : 'Disable'}
                  variant={row.disabled ? undefined : 'ghost'}
                  onPress={() => void toggleDisabled(row)}
                />
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso.slice(0, 10);
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value || 0);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  header: { gap: 4 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: theme.colors.muted, fontSize: 13 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCell: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },
  cardLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  help: { color: theme.colors.muted, fontSize: 12, lineHeight: 17 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: theme.colors.text,
    fontSize: 14,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listText: { color: theme.colors.text, fontSize: 13, flex: 1 },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  userEmail: { color: theme.colors.muted, fontSize: 12 },
  userMeta: { color: theme.colors.muted, fontSize: 11 },
  userTokenMeta: { color: theme.colors.textDim || theme.colors.muted, fontSize: 11 },
  adminBadge: { color: theme.colors.magenta, fontSize: 10, fontWeight: '700' },
  disabledBadge: { color: theme.colors.danger, fontSize: 10, fontWeight: '700' },
});
