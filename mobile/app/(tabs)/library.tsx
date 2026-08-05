// mobile/app/(tabs)/library.tsx — drop-in replacement
import React from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';
import { theme } from '../../src/theme';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { Button } from '../../src/components/Button';

type Creation = {
  id: string;
  userId?: string;
  status: string;
  songTitle?: string;
  coverArtUrl?: string;
  actualCostUsd: number;
  estimatedCostUsd: number;
  createdAt: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  storageBytes?: number;
  owner?: {
    id: string;
    email: string;
    displayName: string;
    plan: string;
  } | null;
  input: { theme: string; genre: string; mode: string; customPrompt?: string };
};

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  completed: { bg: 'rgba(0,217,163,0.15)', fg: theme.colors.success, label: 'Done' },
  processing: { bg: 'rgba(0,229,255,0.15)', fg: theme.colors.cyan, label: 'Processing' },
  pending:    { bg: 'rgba(0,229,255,0.15)', fg: theme.colors.cyan, label: 'Queued' },
  failed:     { bg: 'rgba(255,84,112,0.15)', fg: theme.colors.danger, label: 'Failed' },
  cancelled:  { bg: 'rgba(138,123,168,0.15)', fg: theme.colors.muted, label: 'Cancelled' },
};

export default function LibraryScreen() {
  const { token, user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const bp = useBreakpoint();
  const cols = bp === 'desktop' ? 3 : bp === 'tablet' ? 2 : 1;
  const [items, setItems] = React.useState<Creation[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const endpoint = isAdmin ? '/v1/admin/creations' : '/v1/creations';
      const result = await api<{ creations: Creation[] }>(endpoint, {}, token || undefined);
      setItems(result.creations);
      setLoaded(true);
    } finally {
      setRefreshing(false);
    }
  }, [token, isAdmin]);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  const deleteCreation = async (item: Creation) => {
    if (!isAdmin || !token) return;
    const label = item.songTitle || item.input?.theme || item.id;

    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Delete "${label}" and all stored files? This cannot be undone.`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Delete creation?',
              `Delete "${label}" and all stored files? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
              ],
            );
          });

    if (!confirmed) return;

    await api(`/v1/admin/creations/${item.id}`, { method: 'DELETE' }, token);
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.cyan} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{isAdmin ? 'Admin Library' : 'Library'}</Text>
        <Text style={styles.subtitle}>
          {items.length} {items.length === 1 ? 'song' : 'songs'}{isAdmin ? ' across all users' : ''}
        </Text>
      </View>

      {!loaded ? (
        <View style={styles.grid}>
          {Array.from({ length: cols * 2 }).map((_, i) => (
            <View key={i} style={[styles.card, styles.skeleton, { width: `${100 / cols}%` } as any]}>
              <View style={styles.skeletonCover} />
            </View>
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.id} style={[styles.cardWrap, { width: `${100 / cols}%` } as any]}>
              <CreationCard
                item={item}
                isAdmin={isAdmin}
                onDelete={() => void deleteCreation(item)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function CreationCard({
  item,
  isAdmin,
  onDelete,
}: {
  item: Creation;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const status = STATUS_COLORS[item.status] || STATUS_COLORS.pending;

  const webHover = Platform.OS === 'web' && hovered ? {
    transform: [{ translateY: -2 }],
    boxShadow: '0 12px 32px rgba(255,45,149,0.2)',
    borderColor: theme.colors.borderStrong,
  } as any : null;

  const webTransition = Platform.OS === 'web' ? {
    transition: 'transform 200ms ease-out, box-shadow 200ms, border-color 200ms',
    cursor: 'pointer',
  } as any : null;

  return (
    <View style={[styles.card, webTransition, webHover]}>
      <Pressable
        onPress={() => router.push(`/creation/${item.id}`)}
        // @ts-ignore
        onHoverIn={() => setHovered(true)}
        // @ts-ignore
        onHoverOut={() => setHovered(false)}
      >
        <View style={styles.coverWrap}>
          {item.coverArtUrl ? (
            <Image source={{ uri: item.coverArtUrl }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>♪</Text>
            </View>
          )}
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardTitle}>{item.songTitle || `${item.input.theme} · ${item.input.genre}`}</Text>
          {isAdmin && item.owner ? (
            <Text numberOfLines={1} style={styles.ownerText}>
              Owner: {item.owner.displayName} · {item.owner.email}
            </Text>
          ) : null}
          {isAdmin && item.input?.customPrompt ? (
            <Text numberOfLines={2} style={styles.promptText}>Prompt: {item.input.customPrompt}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>{item.input.mode}</Text>
            <Text style={styles.cardMetaDot}>·</Text>
            <Text style={styles.cardMetaText}>${(item.actualCostUsd || item.estimatedCostUsd).toFixed(2)}</Text>
            {isAdmin ? (
              <>
                <Text style={styles.cardMetaDot}>·</Text>
                <Text style={styles.cardMetaText}>{formatNumber(item.totalTokens || 0)} tokens</Text>
              </>
            ) : null}
            {isAdmin && item.storageBytes != null ? (
              <>
                <Text style={styles.cardMetaDot}>·</Text>
                <Text style={styles.cardMetaText}>{formatBytes(item.storageBytes)}</Text>
              </>
            ) : null}
            <Text style={styles.cardMetaDot}>·</Text>
            <Text style={styles.cardMetaText}>{relativeTime(item.createdAt)}</Text>
          </View>
        </View>
      </Pressable>
      {isAdmin ? (
        <View style={styles.adminActions}>
          <Button label="Delete files" variant="danger" onPress={onDelete} />
        </View>
      ) : null}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.emoji}>♪</Text>
      <Text style={emptyStyles.title}>No songs yet</Text>
      <Text style={emptyStyles.body}>Head to Create to make your first one. Takes about 90 seconds.</Text>
    </View>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value || 0);
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space.lg, gap: theme.space.lg, paddingBottom: theme.space.xxxl, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  header: { gap: theme.space.xs },
  title: { ...theme.type.h1, color: theme.colors.text },
  subtitle: { color: theme.colors.muted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8, alignItems: 'flex-start' },
  cardWrap: { padding: 8 },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  skeleton: { padding: 0, height: 240 },
  skeletonCover: { flex: 1, backgroundColor: theme.colors.surface, opacity: 0.6 },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 1, backgroundColor: theme.colors.surface },
  coverPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, #1b0f2e 0%, #2d1b4e 100%)', backgroundColor: 'transparent' } as any) : null),
  },
  coverPlaceholderText: { color: theme.colors.borderStrong, fontSize: 80, fontWeight: '300' },
  statusPill: {
    position: 'absolute',
    top: 10, right: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: theme.radius.pill,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as any) : null),
  },
  statusText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  cardBody: { padding: theme.space.md, gap: 4 },
  cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  ownerText: { color: theme.colors.warning, fontSize: 11 },
  promptText: { color: theme.colors.textDim || theme.colors.muted, fontSize: 11, lineHeight: 15 },
  cardMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  cardMetaText: { color: theme.colors.muted, fontSize: 12, textTransform: 'capitalize' },
  cardMetaDot: { color: theme.colors.muted, fontSize: 12 },
  adminActions: { padding: theme.space.md, paddingTop: 0, alignItems: 'flex-start' },
});

const emptyStyles = StyleSheet.create({
  wrap: { padding: theme.space.xxxl, alignItems: 'center', gap: theme.space.md },
  emoji: { color: theme.colors.borderStrong, fontSize: 64 },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
  body: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', maxWidth: 320 },
});
