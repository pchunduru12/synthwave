// mobile/src/components/Button.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, ActivityIndicator, Platform } from 'react-native';
import { theme } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style, fullWidth }: Props) {
  const isDisabled = disabled || loading;
  const [hovered, setHovered] = React.useState(false);

  const containerStyle: ViewStyle[] = [
    styles.base,
    fullWidth ? styles.fullWidth : null,
    variant === 'primary' ? styles.primary : null,
    variant === 'secondary' ? styles.secondary : null,
    variant === 'ghost' ? styles.ghost : null,
    variant === 'danger' ? styles.danger : null,
    hovered && variant === 'primary' ? styles.primaryHover : null,
    hovered && variant === 'secondary' ? styles.secondaryHover : null,
    isDisabled ? styles.disabled : null,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const textStyle = [
    styles.label,
    variant === 'ghost' ? styles.labelGhost : null,
    variant === 'secondary' ? styles.labelSecondary : null,
  ];

  // On web we use a CSS gradient via inline style (RN runtime ignores `background`,
  // but react-native-web maps it through). On native, the flat magenta is fine for now;
  // adding expo-linear-gradient is the next step if the team wants the full duotone.
  const webPrimaryStyle = Platform.OS === 'web' && variant === 'primary' ? {
    backgroundImage: 'linear-gradient(135deg, #ff2d95 0%, #9d4edd 50%, #00e5ff 100%)',
    boxShadow: hovered ? '0 0 24px rgba(255,45,149,0.45)' : '0 0 16px rgba(255,45,149,0.25)',
    transition: 'box-shadow 200ms ease-out',
  } as any : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={webPrimaryStyle ? ([...containerStyle, webPrimaryStyle] as any) : containerStyle}
      // @ts-ignore — react-native-web exposes hover events
      onHoverIn={() => setHovered(true)}
      // @ts-ignore — react-native-web exposes hover events
      onHoverOut={() => setHovered(false)}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={theme.colors.text} />
          <Text style={[textStyle, { marginLeft: 8 }]}>{label}</Text>
        </View>
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  fullWidth: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  primary: {
    backgroundColor: theme.colors.magenta,
  },
  primaryHover: {},
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  secondaryHover: {
    backgroundColor: theme.colors.raised,
    borderColor: theme.colors.cyan,
  },
  ghost: {
    backgroundColor: 'transparent',
    minHeight: 32,
    paddingVertical: theme.space.sm,
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
  disabled: { opacity: 0.5 },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  labelGhost: { color: theme.colors.cyan },
  labelSecondary: { color: theme.colors.text },
});
