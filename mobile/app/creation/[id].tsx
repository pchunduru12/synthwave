// mobile/app/creation/[id].tsx — drop-in replacement
import React from 'react';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { useBreakpoint } from '../../src/lib/useBreakpoint';

type Artifact = { key: string; label: string; url: string; mimeType: string };
type Stage = { id: string; label?: string; status: string; progress: number; detail: string };

type CreationResponse = {
  id?: string; creationId?: string; status?: string; songTitle?: string;
  artistPersona?: string; detectedIntent?: string; detectedSubject?: string;
  styleNotes?: string[]; lyricsText?: string; sunoPrompt?: string; imagePrompt?: string;
  coverArtUrl?: string; backgroundPreviewUrl?: string; audioUrl?: string; videoUrl?: string;
  estimatedCostUsd?: number; actualCostUsd?: number; errorMessage?: string;
  artifacts?: Artifact[]; pipelineStages?: Stage[]; createdAt?: string; updatedAt?: string;
  input?: any; [key: string]: any;
};

const PIPELINE_ORDER = ['prompt', 'lyrics', 'music', 'image', 'video'];

function unwrapPayload(payload: any): CreationResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.creation && typeof payload.creation === 'object') return payload.creation;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  if (payload.result && typeof payload.result === 'object') return payload.result;
  return payload;
}


function artifactUrlFor(data: CreationResponse | null | undefined, key: string): string | undefined {
  return data?.artifacts?.find((item) => item.key === key)?.url;
}

function progressiveVisualUrl(data: CreationResponse): string | undefined {
  return data.coverArtUrl || data.backgroundPreviewUrl || artifactUrlFor(data, 'backgroundPreview');
}

function progressiveVisualLabel(data: CreationResponse): string {
  if (data.videoUrl) return 'Final video ready';
  if (data.coverArtUrl) return 'Final artwork ready';
  if (data.backgroundPreviewUrl || artifactUrlFor(data, 'backgroundPreview')) return 'Background scene ready';
  if (data.audioUrl) return 'Song ready — building visuals';
  return 'Creating your song';
}

function activeProgressMessage(data: CreationResponse): string {
  if (data.videoUrl) return 'Your video is ready.';
  if (data.coverArtUrl) return 'Final artwork is ready. Rendering your video now...';
  if (data.backgroundPreviewUrl || artifactUrlFor(data, 'backgroundPreview')) return 'Scene is ready. Blending your original photo into it...';
  if (data.audioUrl) return 'Your song is ready. You can listen while SynthWave builds the visuals.';
  return 'Writing lyrics and generating your song package...';
}

function normalizeCreation(primary: any, fallback?: any): CreationResponse | null {
  const a = unwrapPayload(primary) || {};
  const b = unwrapPayload(fallback) || {};
  const merged: CreationResponse = {
    ...b, ...a,
    artifacts: Array.isArray(a.artifacts) ? a.artifacts : Array.isArray(b.artifacts) ? b.artifacts : [],
    pipelineStages: Array.isArray(a.pipelineStages) ? a.pipelineStages : Array.isArray(b.pipelineStages) ? b.pipelineStages : [],
    styleNotes: Array.isArray(a.styleNotes) ? a.styleNotes : Array.isArray(b.styleNotes) ? b.styleNotes : [],
  };
  if (!merged.id && merged.creationId) merged.id = merged.creationId;
  if (merged.coverArtUrl || merged.audioUrl || merged.videoUrl || (merged.pipelineStages && merged.pipelineStages.length > 0) || merged.status) {
    return merged;
  }
  return null;
}

export default function CreationDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const creationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token, ready } = useAuth();
  const bp = useBreakpoint();
  const isWide = bp !== 'phone';

  const [data, setData] = React.useState<CreationResponse | null>(null);
  const [loadError, setLoadError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!ready || !creationId || !token) return;
    try {
      const [detail, status] = await Promise.allSettled([
        api<any>(`/v1/creations/${creationId}`, {}, token),
        api<any>(`/v1/creations/${creationId}/status`, {}, token),
      ]);
      const normalized = normalizeCreation(
        detail.status === 'fulfilled' ? detail.value : null,
        status.status === 'fulfilled' ? status.value : null,
      );
      if (!normalized) {
        setData(null);
        setLoadError('Creation not found.');
        return;
      }
      setData(normalized);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load creation');
    }
  }, [creationId, ready, token]);

  React.useEffect(() => {
    if (!ready || !creationId || !token) return;
    let active = true;
    void load();
    // Stop polling once terminal
    const timer = setInterval(() => {
      if (!active) return;
      const terminal = data?.status === 'completed' || data?.status === 'failed' || data?.status === 'cancelled';
      if (terminal) return;
      void load();
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [creationId, ready, token, load, data?.status]);

  const cancel = async () => {
    if (!creationId || !token) return;
    try {
      await api(`/v1/creations/${creationId}/cancel`, { method: 'POST' }, token);
      await load();
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(`Cancel failed: ${err.message}`);
      else Alert.alert('Cancel failed', err.message);
    }
  };

  const openAsset = async (url?: string) => {
    if (!url) return;
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  const isFinished = data?.status === 'completed';
  const isActive = data?.status === 'processing' || data?.status === 'pending';
  const isFailed = data?.status === 'failed';

  const lyricsArtifactUrl = data?.artifacts?.find((item) => item.key === 'lyrics')?.url;
  const promptPackageUrl = data?.artifacts?.find((item) => item.key === 'promptPackage')?.url;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: data?.songTitle || 'Creating...', headerStyle: { backgroundColor: theme.colors.bg } as any, headerTintColor: theme.colors.text }} />

      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back to library</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>{data?.songTitle || 'Creating your song...'}</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.metaText}>
            {data?.estimatedCostUsd != null ? `Est $${data.estimatedCostUsd.toFixed(2)}` : ''}
            {data?.actualCostUsd != null && data.actualCostUsd > 0 ? ` · Spent $${data.actualCostUsd.toFixed(2)}` : ''}
          </Text>
          {data?.detectedIntent ? (
            <Text style={styles.intent}>· Intent: {data.detectedIntent}{data.detectedSubject ? ` (${data.detectedSubject})` : ''}</Text>
          ) : null}
        </View>
      </View>

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {isActive ? (
        <PipelineHero data={data!} onCancel={cancel} isWide={isWide} openAsset={openAsset} />
      ) : isFailed ? (
        <FailedState message={data?.errorMessage || 'The creation failed.'} />
      ) : isFinished ? (
        <CompletedView data={data!} isWide={isWide} openAsset={openAsset} lyricsArtifactUrl={lyricsArtifactUrl} promptPackageUrl={promptPackageUrl} />
      ) : (
        <View style={styles.loadingCard}>
          <Text style={styles.muted}>Loading creation details...</Text>
        </View>
      )}
    </ScrollView>
  );
}

function PipelineHero({ data, onCancel, isWide, openAsset }: { data: CreationResponse; onCancel: () => void; isWide: boolean; openAsset: (u?: string) => void }) {
  const stages = data.pipelineStages || [];
  // Sort stages by canonical order
  const ordered = [...stages].sort((a, b) => {
    const ia = PIPELINE_ORDER.indexOf(a.id);
    const ib = PIPELINE_ORDER.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const overall = ordered.length > 0
    ? Math.round(ordered.reduce((sum, s) => sum + (s.progress || 0), 0) / ordered.length)
    : 0;
  const visualUrl = progressiveVisualUrl(data);
  const visualLabel = progressiveVisualLabel(data);
  const progressMessage = activeProgressMessage(data);

  return (
    <View style={[heroStyles.wrap, isWide ? heroStyles.wrapWide : null]}>
      <View style={heroStyles.coverPanel}>
        <View style={heroStyles.coverFrame}>
          {visualUrl ? (
            <>
              <Image source={{ uri: visualUrl }} style={heroStyles.cover} resizeMode="cover" />
              <View style={heroStyles.previewBadge}>
                <Text style={heroStyles.previewBadgeText}>{visualLabel}</Text>
              </View>
            </>
          ) : (
            <View style={[heroStyles.cover, heroStyles.coverPlaceholder]}>
              <View style={heroStyles.gridBg} />
              <Text style={heroStyles.placeholderGlyph}>♪</Text>
            </View>
          )}
        </View>

        <View style={heroStyles.liveCard}>
          <Text style={heroStyles.liveTitle}>{visualLabel}</Text>
          <Text style={heroStyles.liveBody}>{progressMessage}</Text>
          {data.audioUrl ? (
            <View style={heroStyles.audioPreview}>
              <Text style={heroStyles.audioLabel}>Listen while visuals render</Text>
              {Platform.OS === 'web' ? (
                React.createElement('audio', {
                  controls: true,
                  autoPlay: true,
                  src: data.audioUrl,
                  style: { width: '100%', marginTop: 8 },
                })
              ) : (
                <Button label="Open MP3" variant="secondary" onPress={() => openAsset(data.audioUrl)} />
              )}
            </View>
          ) : null}
        </View>

        <View style={heroStyles.overallRow}>
          <Text style={heroStyles.overallLabel}>Overall progress</Text>
          <Text style={heroStyles.overallValue}>{overall}%</Text>
        </View>
        <View style={heroStyles.overallTrack}>
          <View style={[heroStyles.overallFill, { width: `${overall}%` }]} />
        </View>
      </View>

      <View style={heroStyles.stagesPanel}>
        <Text style={heroStyles.panelTitle}>Pipeline</Text>
        <Text style={heroStyles.panelSub}>Audio, image, and video are shown as soon as each artifact is ready.</Text>
        <View style={heroStyles.stagesList}>
          {ordered.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </View>

        <View style={{ marginTop: theme.space.lg }}>
          <Button label="Cancel" variant="danger" onPress={onCancel} />
        </View>
      </View>
    </View>
  );
}

function StageRow({ stage }: { stage: Stage }) {
  const done = stage.status === 'done' || stage.status === 'completed' || stage.progress >= 100;
  const active = stage.status === 'running' || stage.status === 'processing' || (stage.progress > 0 && stage.progress < 100);
  const indicator = done ? '●' : active ? '◐' : '○';
  const indicatorColor = done ? theme.colors.success : active ? theme.colors.cyan : theme.colors.muted;

  return (
    <View style={stageStyles.row}>
      <Text style={[stageStyles.indicator, { color: indicatorColor }]}>{indicator}</Text>
      <View style={stageStyles.info}>
        <View style={stageStyles.headRow}>
          <Text style={stageStyles.name}>{prettyStageName(stage.label || stage.id)}</Text>
          <Text style={stageStyles.pct}>{stage.progress}%</Text>
        </View>
        <View style={stageStyles.track}>
          <View style={[stageStyles.fill, { width: `${stage.progress}%`, backgroundColor: done ? theme.colors.success : theme.colors.cyan }]} />
        </View>
        {stage.detail ? <Text style={stageStyles.detail}>{stage.detail}</Text> : null}
      </View>
    </View>
  );
}

function CompletedView({ data, isWide, openAsset, lyricsArtifactUrl, promptPackageUrl }: any) {
  return (
    <View style={[styles.completedLayout, isWide ? styles.completedLayoutWide : null]}>
      <View style={[styles.completedLeft, isWide && styles.completedLeftWide]}>
        <View style={styles.coverHero}>
          {data.coverArtUrl ? (
            <Image source={{ uri: data.coverArtUrl }} style={styles.heroCoverImg} resizeMode="cover" />
          ) : (
            <View style={[styles.heroCoverImg, styles.heroCoverPlaceholder]}>
              <Text style={styles.heroPlaceholderGlyph}>♪</Text>
            </View>
          )}
        </View>

        {data.audioUrl ? (
          <View style={styles.playerCard}>
            <Text style={styles.playerLabel}>Listen</Text>
            {Platform.OS === 'web' ? (
              React.createElement('audio', { controls: true, src: data.audioUrl, style: { width: '100%', marginTop: 8 } })
            ) : (
              <Button label="Open MP3" variant="secondary" onPress={() => openAsset(data.audioUrl)} />
            )}
          </View>
        ) : null}

        {data.videoUrl ? (
          <View style={styles.playerCard}>
            <Text style={styles.playerLabel}>Watch</Text>
            {Platform.OS === 'web' ? (
              React.createElement('video', { controls: true, src: data.videoUrl, style: { width: '100%', borderRadius: 12, marginTop: 8 } })
            ) : (
              <Button label="Open MP4" variant="secondary" onPress={() => openAsset(data.videoUrl)} />
            )}
          </View>
        ) : null}
      </View>

      <View style={[styles.completedRight, isWide && styles.completedRightWide]}>
        <View style={styles.detailCard}>
          <Text style={styles.cardLabel}>Lyrics</Text>
          <Text style={styles.lyrics}>{data.lyricsText || 'No lyrics returned.'}</Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardLabel}>Downloads</Text>
          <View style={styles.downloadGrid}>
            <DownloadButton label="Cover" url={data.coverArtUrl} openAsset={openAsset} />
            <DownloadButton label="Background" url={data.backgroundPreviewUrl || artifactUrlFor(data, 'backgroundPreview')} openAsset={openAsset} />
            <DownloadButton label="MP3"   url={data.audioUrl}    openAsset={openAsset} />
            <DownloadButton label="MP4"   url={data.videoUrl}    openAsset={openAsset} />
            <DownloadButton label="Lyrics .txt" url={lyricsArtifactUrl} openAsset={openAsset} />
            <DownloadButton label="Prompt JSON" url={promptPackageUrl} openAsset={openAsset} />
          </View>
        </View>

        {data.styleNotes?.length ? (
          <View style={styles.detailCard}>
            <Text style={styles.cardLabel}>Style notes</Text>
            {data.styleNotes.map((note: string) => (
              <Text key={note} style={styles.bullet}>• {note}</Text>
            ))}
          </View>
        ) : null}

        {data.sunoPrompt || data.imagePrompt ? (
          <View style={styles.detailCard}>
            <Text style={styles.cardLabel}>Prompts (debug)</Text>
            {data.sunoPrompt ? (
              <>
                <Text style={styles.subLabel}>Music</Text>
                <Text style={styles.mono}>{data.sunoPrompt}</Text>
              </>
            ) : null}
            {data.imagePrompt ? (
              <>
                <Text style={styles.subLabel}>Image</Text>
                <Text style={styles.mono}>{data.imagePrompt}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DownloadButton({ label, url, openAsset }: { label: string; url?: string; openAsset: (u?: string) => void }) {
  return (
    <Pressable
      disabled={!url}
      onPress={() => openAsset(url)}
      style={[styles.downloadBtn, !url ? styles.downloadDisabled : null]}
    >
      <Text style={[styles.downloadText, !url ? styles.downloadTextDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

function FailedState({ message }: { message: string }) {
  return (
    <View style={failedStyles.wrap}>
      <View style={failedStyles.iconCircle}>
        <Text style={failedStyles.icon}>!</Text>
      </View>
      <Text style={failedStyles.title}>Creation failed</Text>
      <Text style={failedStyles.body}>{message}</Text>
      <Button label="Try again" onPress={() => router.replace('/(tabs)/create')} />
    </View>
  );
}

function prettyStageName(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxxl, gap: theme.space.lg, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: theme.colors.cyan, fontSize: 13, fontWeight: '500' },
  header: { gap: theme.space.xs },
  title: { ...theme.type.h1, color: theme.colors.text },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaText: { color: theme.colors.muted, fontSize: 13 },
  intent: { color: theme.colors.warning, fontSize: 13 },
  error: {
    backgroundColor: 'rgba(255,84,112,0.1)', borderColor: 'rgba(255,84,112,0.3)', borderWidth: 1,
    color: theme.colors.danger, padding: theme.space.md, borderRadius: theme.radius.md, fontSize: 13,
  },
  muted: { color: theme.colors.muted },
  loadingCard: {
    backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg, padding: theme.space.xl, alignItems: 'center',
  },
  completedLayout: { gap: theme.space.lg },
  completedLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  completedLeft: { gap: theme.space.md },
  completedLeftWide: { flex: 1.1, minWidth: 0 },
  completedRight: { gap: theme.space.md },
  completedRightWide: { flex: 1, minWidth: 0 },
  coverHero: {
    aspectRatio: 1,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: 1, borderColor: theme.colors.border,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } as any) : null),
  },
  heroCoverImg: { width: '100%', height: '100%' },
  heroCoverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface },
  heroPlaceholderGlyph: { color: theme.colors.borderStrong, fontSize: 96, fontWeight: '300' },
  playerCard: {
    backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg, padding: theme.space.lg,
  },
  playerLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  detailCard: {
    backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg, padding: theme.space.lg,
  },
  cardLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: theme.space.sm },
  subLabel: { color: theme.colors.textDim, fontSize: 12, fontWeight: '600', marginTop: theme.space.sm, marginBottom: 4 },
  lyrics: { color: theme.colors.text, lineHeight: 22, fontSize: 14 },
  bullet: { color: theme.colors.textDim, fontSize: 13, lineHeight: 20 },
  mono: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, fontFamily: Platform.select({ web: 'ui-monospace, Menlo, monospace', default: 'monospace' }) },
  downloadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  downloadBtn: {
    paddingHorizontal: theme.space.md, paddingVertical: 8,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 150ms' } as any) : null),
  },
  downloadDisabled: { opacity: 0.4 },
  downloadText: { color: theme.colors.cyan, fontSize: 13, fontWeight: '500' },
  downloadTextDisabled: { color: theme.colors.muted },
});

const heroStyles = StyleSheet.create({
  wrap: { gap: theme.space.lg },
  wrapWide: { flexDirection: 'row', alignItems: 'flex-start' },
  coverPanel: { flex: 1, gap: theme.space.md, minWidth: 0 },
  coverFrame: {
    aspectRatio: 1,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: 1, borderColor: theme.colors.border,
    position: 'relative',
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } as any) : null),
  },
  cover: { width: '100%', height: '100%' },
  previewBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(10,6,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  previewBadgeText: { color: theme.colors.text, fontSize: 11, fontWeight: '700' },
  liveCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
  },
  liveTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  liveBody: { color: theme.colors.textDim, fontSize: 13, lineHeight: 19 },
  audioPreview: { marginTop: theme.space.sm },
  audioLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, position: 'relative' },
  gridBg: {
    ...StyleSheet.absoluteFillObject as any,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(rgba(255,45,149,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.6,
        } as any)
      : null),
  },
  placeholderGlyph: { color: theme.colors.borderStrong, fontSize: 96, fontWeight: '300' },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  overallLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  overallValue: { color: theme.colors.text, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] as any },
  overallTrack: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  overallFill: {
    height: '100%',
    backgroundColor: theme.colors.magenta,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, #ff2d95 0%, #00e5ff 100%)' } as any) : null),
  },
  stagesPanel: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border, borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    minWidth: 0,
  },
  panelTitle: { ...theme.type.h2, color: theme.colors.text },
  panelSub: { color: theme.colors.muted, fontSize: 12, marginTop: 2, marginBottom: theme.space.lg },
  stagesList: { gap: theme.space.md },
});

const stageStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.space.md },
  indicator: { fontSize: 14, lineHeight: 18, marginTop: 1, width: 14 },
  info: { flex: 1, gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { color: theme.colors.text, fontSize: 13, fontWeight: '500' },
  pct: { color: theme.colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] as any },
  track: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  fill: { height: '100%' },
  detail: { color: theme.colors.muted, fontSize: 11, lineHeight: 14 },
});

const failedStyles = StyleSheet.create({
  wrap: { padding: theme.space.xxxl, alignItems: 'center', gap: theme.space.md, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,84,112,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { color: theme.colors.danger, fontSize: 28, fontWeight: '700' },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '600' },
  body: { color: theme.colors.muted, fontSize: 14, textAlign: 'center', maxWidth: 400 },
});
