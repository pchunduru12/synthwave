// mobile/app/(auth)/register.tsx — drop-in replacement
import React from 'react';
import { Link, router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { theme } from '../../src/theme';
import { Button } from '../../src/components/Button';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    setError('');
    if (displayName.trim().length < 2) return setError('Display name must be at least 2 characters.');
    if (!email.includes('@')) return setError('Enter a valid email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    try {
      setSubmitting(true);
      await register(displayName.trim(), email.trim(), password);
      router.replace('/(tabs)/create');
    } catch (err: any) {
      setError(humanize(err?.message) || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.logoBlock} />
          <Text style={styles.brand}>SynthWave</Text>
        </View>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Beta access — invitation may be required.</Text>

        <View style={styles.form}>
          <FieldInput label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" autoComplete="name" />
          <FieldInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" inputMode="email" placeholder="you@example.com" />
          <FieldInput label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" onSubmitEditing={submit} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button label="Create account" onPress={submit} loading={submitting} fullWidth />

          <Link href="/(auth)/login" style={styles.link}>Already have an account? Log in →</Link>
        </View>
      </View>
    </ScrollView>
  );
}

function FieldInput(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[styles.input, focused ? styles.inputFocused : null]}
        placeholderTextColor={theme.colors.muted}
      />
    </View>
  );
}

function humanize(raw?: string): string {
  if (!raw) return '';
  if (raw.includes('email_already_exists')) return 'That email is already registered.';
  if (raw.includes('invite_required')) return 'This email is not on the beta invite list.';
  if (raw.includes('rate_limited')) return 'Too many attempts. Try again in a minute.';
  if (raw.includes('Network') || raw.includes('Failed to fetch')) return "Can't reach the server. Check your connection.";
  return raw.split('\n')[0];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(255,45,149,0.15) 0%, transparent 60%)', backgroundColor: theme.colors.bg } as any)
      : null),
  },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.space.xl,
    width: '100%',
    maxWidth: 420,
    gap: theme.space.md,
    ...(Platform.OS === 'web'
      ? ({ backgroundImage: 'linear-gradient(180deg, #1b0f2e 0%, #13091f 100%)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' } as any)
      : null),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: theme.space.md },
  logoBlock: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.magenta,
    ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(135deg, #ff2d95 0%, #00e5ff 100%)' } as any) : null),
  },
  brand: { color: theme.colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  title: { ...theme.type.h1, color: theme.colors.text },
  subtitle: { ...theme.type.body, color: theme.colors.muted, marginBottom: theme.space.md },
  form: { gap: theme.space.md },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: theme.colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: {
    backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1,
    color: theme.colors.text, borderRadius: theme.radius.md, paddingHorizontal: theme.space.md, paddingVertical: 12, fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', transition: 'border-color 150ms, box-shadow 150ms' } as any) : null),
  },
  inputFocused: {
    borderColor: theme.colors.cyan,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 0 0 2px rgba(0,229,255,0.25)' } as any) : null),
  },
  error: {
    backgroundColor: 'rgba(255,84,112,0.1)', borderColor: 'rgba(255,84,112,0.3)', borderWidth: 1,
    color: theme.colors.danger, padding: 10, borderRadius: theme.radius.md, fontSize: 13,
  },
  link: { color: theme.colors.cyan, textAlign: 'center', marginTop: theme.space.sm, fontSize: 14 },
});
