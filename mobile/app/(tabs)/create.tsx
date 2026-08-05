// mobile/app/(tabs)/create.tsx — drop-in replacement
import React from 'react';
import { router } from 'expo-router';
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/lib/auth';
import { api } from '../../src/lib/api';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';
import { Chips, FieldLabel } from '../../src/components/Chips';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import { AdminProviderToggle, type AudioProvider } from '../../src/components/AdminProviderToggle';
import { useBreakpoint } from '../../src/lib/useBreakpoint';

type Estimate = {
  totalUsd: number;
  stages: Array<{ id: string; provider: string; model: string; estimatedCostUsd: number }>;
};

type CreationPayload = {
  theme: string;
  genre: string;
  language: string;
  vocalist: string;
  mood: string;
  tempo: string;
  duration: number;
  customPrompt?: string;
  mode: 'economy' | 'balanced' | 'premium';
  audioProvider?: AudioProvider;
};

const THEMES = ['spiritual', 'love', 'adventure', 'hope', 'nature', 'nostalgia'] as const;
const GENRES = ['pop', 'classical', 'folk', 'indie', 'lofi', 'jazz'] as const;
const LANGUAGES = ['English', 'Spanish', 'French', 'Hindi', 'Telugu', 'Tamil', 'Bengali', 'Marathi', 'Punjabi', 'Portuguese', 'Arabic', 'Japanese', 'Korean', 'Mandarin', 'German', 'Italian', 'Swahili'] as const;
const VOCALISTS = ['female', 'male'] as const;
const MOODS = ['Uplifting', 'Romantic', 'Dreamy', 'Chill', 'Playful', 'Intense'] as const;
const TEMPOS = ['Very Slow', 'Slow', 'Moderate', 'Fast'] as const;
const DURATIONS = [30, 45, 60] as const;

const STAGE_COLORS: Record<string, string> = {
  prompt: theme.colors.cyan,
  lyrics: theme.colors.cyan,
  image: theme.colors.violet,
  cover: theme.colors.violet,
  music: theme.colors.magenta,
  audio: theme.colors.magenta,
  video: theme.colors.warning,
};

export default function CreateScreen() {
  const { token, user } = useAuth();
  const bp = useBreakpoint();
  const isWide = bp !== 'phone';

  const [themeValue, setThemeValue] = React.useState<(typeof THEMES)[number]>('spiritual');
  const [genre, setGenre] = React.useState<(typeof GENRES)[number]>('pop');
  const [language, setLanguage] = React.useState<(typeof LANGUAGES)[number]>('English');
  const [vocalist, setVocalist] = React.useState<(typeof VOCALISTS)[number]>('female');
  const [mood, setMood] = React.useState<(typeof MOODS)[number]>('Uplifting');
  const [tempo, setTempo] = React.useState<(typeof TEMPOS)[number]>('Moderate');
  const [duration, setDuration] = React.useState<(typeof DURATIONS)[number]>(30);
  const [customPrompt, setCustomPrompt] = React.useState('Radha Krishna bhakti song with sweet melody and devotional energy');
  const [mode, setMode] = React.useState<'economy' | 'balanced' | 'premium'>('balanced');
  const [audioProvider, setAudioProvider] = React.useState<AudioProvider | undefined>(undefined);
  const [estimate, setEstimate] = React.useState<Estimate | null>(null);
  const [estimateLoading, setEstimateLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [coverImage, setCoverImage] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = React.useState('');

  const payload = React.useMemo<CreationPayload>(
    () => ({ theme: themeValue, genre, language, vocalist, mood, tempo, duration, customPrompt: customPrompt.trim() || undefined, mode,audioProvider, }),
    [themeValue, genre, language, vocalist, mood, tempo, duration, customPrompt, mode],
  );

  // Debounced live estimate. Whenever any input changes, wait 500ms then fetch.
  // Cheap on the server (no provider calls — just cost math), big UX improvement.
  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setEstimateLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await api<Estimate>('/v1/creations/estimate', { method: 'POST', body: JSON.stringify(payload) }, token);
        if (!cancelled) {
          setEstimate(next);
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) setError(humanize(err?.message) || 'Could not estimate cost.');
      } finally {
        if (!cancelled) setEstimateLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [payload, token]);

  const pickCoverImage = async () => {
    try {
      setError('');

      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('Please allow photo library access to upload a cover image.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]) {
        setCoverImage(result.assets[0]);
      }
    } catch (err: any) {
      setError(humanize(err?.message) || 'Could not select image.');
    }
  };

  const create = async () => {
    try {
      setError('');
      setCreating(true);

      const body = coverImage
        ? buildCreationFormData(payload, coverImage)
        : JSON.stringify(payload);

      const result = await api<{ creationId: string }>(
        '/v1/creations',
        { method: 'POST', body },
        token || undefined,
      );

      router.push(`/creation/${result.creationId}`);
    } catch (err: any) {
      setError(humanize(err?.message) || 'Could not create song.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Create a song</Text>
        <Text style={styles.subtitle}>Describe the vibe — we'll handle title, lyrics, art, and music.</Text>
      </View>

      <View style={[styles.layout, isWide ? styles.layoutWide : styles.layoutNarrow]}>
        <View style={[styles.left, isWide && styles.leftWide]}>
          <ModePicker value={mode} onChange={setMode} />

          <FormSection title="Song setup">
            <FieldLabel>Theme</FieldLabel>
            <Chips options={THEMES} value={themeValue} onChange={setThemeValue} />

            <View style={styles.spacerSm} />
            <FieldLabel>Genre</FieldLabel>
            <Chips options={GENRES} value={genre} onChange={setGenre} />

            <View style={styles.spacerSm} />
            <View style={styles.row2}>
              <View style={styles.col}>
                <FieldLabel>Language</FieldLabel>
                <LanguagePicker options={LANGUAGES} value={language} onChange={setLanguage} />
              </View>
              <View style={styles.col}>
                <FieldLabel>Lead vocalist</FieldLabel>
                <Chips options={VOCALISTS} value={vocalist} onChange={setVocalist} />
              </View>
            </View>

            <View style={styles.spacerSm} />
            <View style={styles.row2}>
              <View style={styles.col}>
                <FieldLabel>Mood</FieldLabel>
                <Chips options={MOODS} value={mood} onChange={setMood} />
              </View>
              <View style={styles.col}>
                <FieldLabel>Tempo</FieldLabel>
                <Chips options={TEMPOS} value={tempo} onChange={setTempo} />
              </View>
            </View>

            <View style={styles.spacerSm} />
            <FieldLabel>Duration (seconds)</FieldLabel>
            <Chips
              options={DURATIONS as any as readonly number[]}
              value={duration}
              onChange={(v) => setDuration(v as (typeof DURATIONS)[number])}
              formatLabel={(v) => `${v}s`}
            />

            <View style={styles.spacerMd} />
            <AdminProviderToggle value={audioProvider} onChange={setAudioProvider} />

            <View style={styles.spacerMd} />
            <FieldLabel>Creative direction</FieldLabel>
            <CreativeInput value={customPrompt} onChange={setCustomPrompt} />

            <View style={styles.spacerMd} />
            <FieldLabel>Cover image optional</FieldLabel>
            <CoverImagePicker
              image={coverImage}
              onPick={pickCoverImage}
              onRemove={() => setCoverImage(null)}
            />
          </FormSection>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button label="Reset" variant="secondary" onPress={() => { setCustomPrompt(''); setCoverImage(null); }} />
            <Button label={creating ? 'Creating song...' : 'Create song →'} onPress={create} loading={creating} style={{ flex: 1 } as any} />
          </View>
        </View>

        <View style={[styles.right, isWide && styles.rightWide]}>
          <EstimateCard estimate={estimate} loading={estimateLoading} mode={mode} duration={duration} />
          {user ? <PlanCard plan={user.plan} credits={user.creditsRemaining} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}


function buildCreationFormData(payload: CreationPayload, coverImage: ImagePicker.ImagePickerAsset) {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, String(value));
    }
  });

  const webFile = (coverImage as any).file;
  if (Platform.OS === 'web' && webFile) {
    formData.append('coverImage', webFile);
    return formData;
  }

  formData.append('coverImage', {
    uri: coverImage.uri,
    name: coverImage.fileName || inferFileName(coverImage.uri, coverImage.mimeType),
    type: coverImage.mimeType || 'image/jpeg',
  } as any);

  return formData;
}

function inferFileName(uri: string, mimeType?: string) {
  const extFromMime = mimeType?.split('/')[1] || 'jpg';
  const cleanExt = extFromMime === 'jpeg' ? 'jpg' : extFromMime;
  const fromUri = uri.split('/').pop();
  return fromUri?.includes('.') ? fromUri : `cover-image.${cleanExt}`;
}

function CoverImagePicker({
  image,
  onPick,
  onRemove,
}: {
  image: ImagePicker.ImagePickerAsset | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.coverWrap}>
      <TouchableOpacity activeOpacity={0.85} style={styles.coverPicker} onPress={onPick}>
        {image?.uri ? (
          <Image source={{ uri: image.uri }} style={styles.coverPreview} />
        ) : (
          <View style={styles.coverEmpty}>
            <Text style={styles.coverIcon}>＋</Text>
            <Text style={styles.coverTitle}>Upload cover image</Text>
            <Text style={styles.coverSubtitle}>Optional — we will enhance it with your theme</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.coverActions}>
        <Button
          label={image ? 'Change image' : 'Choose image'}
          variant="secondary"
          onPress={onPick}
        />
        {image ? (
          <Button
            label="Remove"
            variant="ghost"
              onPress={onRemove}
          />
        ) : null}
      </View>

      <Text style={styles.coverHint}>
        If you skip this, SynthWave will generate a fresh AI cover from the song theme.
      </Text>
    </View>
  );
}

function ModePicker({ value, onChange }: { value: 'economy' | 'balanced' | 'premium'; onChange: (v: 'economy' | 'balanced' | 'premium') => void }) {
  const opts: Array<{ id: 'economy' | 'balanced' | 'premium'; label: string }> = [
    { id: 'economy', label: 'Economy' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'premium', label: 'Premium' },
  ];
  return (
    <View style={modeStyles.wrap}>
      {opts.map((opt) => {
        const selected = value === opt.id;
        const webSelStyle = Platform.OS === 'web' && selected ? {
          backgroundImage: 'linear-gradient(135deg, #ff2d95 0%, #9d4edd 100%)',
          backgroundColor: 'transparent',
        } as any : null;
        return (
          <View
            key={opt.id}
            style={[modeStyles.tab, selected ? modeStyles.tabSelected : null, webSelStyle]}
            // @ts-ignore
            onClick={() => onChange(opt.id)}
            onTouchEnd={() => onChange(opt.id)}
          >
            <Text style={[modeStyles.label, selected ? modeStyles.labelSelected : null]}>{opt.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  const webGradient = Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)', backgroundColor: 'transparent' } as any : null;
  return (
    <View style={[sectionStyles.card, webGradient]}>
      <Text style={sectionStyles.title}>{title}</Text>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

function CreativeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      style={[
        styles.textarea,
        focused ? styles.textareaFocused : null,
      ]}
      multiline
      value={value}
      onChangeText={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder="Describe subject, style, and emotional intent. Free-form prose works best."
      placeholderTextColor={theme.colors.muted}
    />
  );
}

function EstimateCard({ estimate, loading, mode, duration }: { estimate: Estimate | null; loading: boolean; mode: string; duration: number }) {
  const webGradient = Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)', backgroundColor: 'transparent' } as any : null;
  return (
    <View style={[estStyles.card, webGradient]}>
      <View style={estStyles.stripe} />
      <Text style={estStyles.label}>Estimated cost</Text>
      <Text style={estStyles.amount}>
        {estimate ? `$${estimate.totalUsd.toFixed(2)}` : '—'}
        {loading ? <Text style={estStyles.loadingDot}>  ·</Text> : null}
      </Text>
      <Text style={estStyles.meta}>{mode} · {duration}s</Text>

      <View style={estStyles.divider} />

      {estimate ? estimate.stages.map((stage) => (
        <View key={stage.id} style={estStyles.row}>
          <View style={estStyles.dotRow}>
            <View style={[estStyles.dot, { backgroundColor: STAGE_COLORS[stage.id] || theme.colors.cyan }]} />
            <Text style={estStyles.stageName}>{prettyStage(stage.id)}</Text>
          </View>
          <Text style={estStyles.stageCost}>${stage.estimatedCostUsd.toFixed(3)}</Text>
        </View>
      )) : (
        <Text style={estStyles.muted}>Adjust inputs to see live cost.</Text>
      )}
    </View>
  );
}

function PlanCard({ plan, credits }: { plan: string; credits: number }) {
  const webGradient = Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)', backgroundColor: 'transparent' } as any : null;
  return (
    <View style={[planStyles.card, webGradient]}>
      <Text style={planStyles.label}>Your plan</Text>
      <View style={planStyles.row}>
        <Text style={planStyles.plan}>{plan}</Text>
        <Text style={planStyles.credits}>{credits} credits</Text>
      </View>
    </View>
  );
}

function prettyStage(id: string): string {
  const map: Record<string, string> = {
    prompt: 'Prompt',
    lyrics: 'Lyrics',
    image: 'Cover art',
    cover: 'Cover art',
    music: 'Music',
    audio: 'Music',
    video: 'Video',
  };
  return map[id] || id;
}

function humanize(raw?: string): string {
  if (!raw) return '';
  if (raw.includes('rate_limited')) return 'Hourly creation limit reached. Try again later.';
  if (raw.includes('hard_limit')) return 'Daily spend cap reached.';
  if (raw.includes('Network') || raw.includes('Failed to fetch')) return "Can't reach the server.";
  return raw.split('\n')[0];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxxl, gap: theme.space.lg, maxWidth: 1280, alignSelf: 'center', width: '100%' },
  header: { gap: theme.space.xs },
  title: { ...theme.type.h1, color: theme.colors.text },
  subtitle: { ...theme.type.body, color: theme.colors.muted },
  layout: { gap: theme.space.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  layoutNarrow: { flexDirection: 'column' },
  left: { gap: theme.space.lg },
  leftWide: { flex: 1.4, minWidth: 0 },
  right: { gap: theme.space.md },
  rightWide: { flex: 1, minWidth: 0, ...(Platform.OS === 'web' ? ({ position: 'sticky', top: theme.space.lg } as any) : null) },
  spacerSm: { height: theme.space.md },
  spacerMd: { height: theme.space.lg },
  row2: { flexDirection: 'row', gap: theme.space.lg, flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 200 },
  textarea: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    fontSize: 15,
    minHeight: 110,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', transition: 'border-color 150ms, box-shadow 150ms' } as any) : null),
  },
  textareaFocused: {
    borderColor: theme.colors.cyan,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 2px rgba(0,229,255,0.25)' } as any) : null),
  },
  coverWrap: { gap: theme.space.sm },
  coverPicker: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    minHeight: 190,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
  },
  coverPreview: { width: '100%', height: 220, resizeMode: 'cover' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center', padding: theme.space.lg, gap: 6 },
  coverIcon: { color: theme.colors.cyan, fontSize: 34, fontWeight: '300' },
  coverTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  coverSubtitle: { color: theme.colors.muted, fontSize: 12, textAlign: 'center' },
  coverActions: { flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' },
  coverHint: { color: theme.colors.muted, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: theme.space.md, alignItems: 'center' },
  error: {
    backgroundColor: 'rgba(255,84,112,0.1)',
    borderColor: 'rgba(255,84,112,0.3)',
    borderWidth: 1,
    color: theme.colors.danger,
    padding: 10,
    borderRadius: theme.radius.md,
    fontSize: 13,
  },
});

const modeStyles = StyleSheet.create({
  wrap: {
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'all 150ms ease-out' } as any) : null),
  },
  tabSelected: {
    backgroundColor: theme.colors.magenta,
  },
  label: { color: theme.colors.textDim, fontSize: 13, fontWeight: '500' },
  labelSelected: { color: '#fff', fontWeight: '600' },
});

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
  },
  title: { ...theme.type.h2, color: theme.colors.text, marginBottom: theme.space.md },
  body: { gap: 6 },
});

const estStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  stripe: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 2,
    backgroundColor: theme.colors.magenta,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, #ff2d95 0%, #9d4edd 50%, #00e5ff 100%)' } as any) : null),
  },
  label: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  amount: { color: theme.colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  loadingDot: { color: theme.colors.cyan },
  meta: { color: theme.colors.muted, fontSize: 12, textTransform: 'capitalize', marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stageName: { color: theme.colors.text, fontSize: 13 },
  stageCost: { color: theme.colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] as any },
  muted: { color: theme.colors.muted, fontSize: 13 },
});

const planStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
  },
  label: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  plan: { color: theme.colors.text, fontSize: 18, fontWeight: '600', textTransform: 'capitalize' },
  credits: { color: theme.colors.cyan, fontSize: 13, fontWeight: '500' },
});
