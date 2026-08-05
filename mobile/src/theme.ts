// mobile/src/theme.ts — drop-in replacement
//
// Full design system. Keep colors as flat hex (RN doesn't support CSS gradients
// natively); gradients are applied via expo-linear-gradient on native or a
// wrapped <View style={webGradientStyle}> on web.

export const theme = {
  colors: {
    // surfaces
    bg:           '#0a0612',
    surface:      '#13091f',
    card:         '#1b0f2e',
    raised:       '#241540',
    border:       '#2d1b4e',
    borderStrong: '#4a2d7a',

    // text
    text:    '#f5f0ff',
    textDim: '#c4b8e0',
    muted:   '#8a7ba8',

    // brand
    magenta: '#ff2d95',
    cyan:    '#00e5ff',
    violet:  '#9d4edd',

    // semantic
    success: '#00d9a3',
    warning: '#ffb340',
    danger:  '#ff5470',

    // legacy aliases — leave so old code keeps compiling while we migrate
    accent:  '#ff2d95',
    accent2: '#00e5ff',
  },

  // gradient stops — render via LinearGradient or web style
  gradients: {
    primary: ['#ff2d95', '#9d4edd', '#00e5ff'] as const, // CTA
    card:    ['#1b0f2e', '#13091f'] as const,             // card bg
    glow:    ['rgba(255,45,149,0.20)', 'transparent'] as const,
  },

  type: {
    display:  { fontSize: 40, fontWeight: '800' as const, lineHeight: 44, letterSpacing: -0.5 },
    h1:       { fontSize: 28, fontWeight: '800' as const, lineHeight: 34, letterSpacing: -0.3 },
    h2:       { fontSize: 20, fontWeight: '700' as const, lineHeight: 26 },
    h3:       { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
    body:     { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
    bodyBold: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
    small:    { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
    micro:    { fontSize: 11, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.5 },
  },

  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 },

  motion: { fast: 120, base: 200, slow: 320 },
};

// Web-only helper for layout breakpoints. RN doesn't have media queries, so we
// detect width via Dimensions and pick a column count in components.
export const breakpoints = { phone: 0, tablet: 720, desktop: 1024 };
