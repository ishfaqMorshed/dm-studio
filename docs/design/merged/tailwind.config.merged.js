import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * DM Studio — MERGED tailwind.config.js (judge's reconciliation of designer A tokens + designer B motion).
 * Front-end only. Semantic colours read RGB triplets from src/index.css (--canvas, --surface-1 …) that flip
 * with the theme; raw scales stay so existing classes compile during migration.
 * Keyframe names are FINAL: breathe · glow · inspect · slide · shimmer · scan (text-edit, once) · fade-up (enter) ·
 * enter-dialog · enter-sheet · leave · fade · fade-out · settle · ring-pulse · resolve-row · pop-in · draw · spin (800 ms).
 */

const stage = (DEFAULT, soft, ink, dim, light) => ({ DEFAULT, soft, ink, dim, light })
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
const OUT_STRONG = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // System preference by default; <html data-theme="light|dark"> (Settings → Appearance) overrides. Needs tailwindcss ≥ 3.4.1 (3.4.19 installed).
  darkMode: ['variant', ['@media (prefers-color-scheme: dark) { &:not(:root[data-theme="light"] *) }', ':root[data-theme="dark"] &']],
  theme: {
    fontFamily: {
      sans: ['"Instrument Sans"', ...defaultTheme.fontFamily.sans],
      display: ['"Bricolage Grotesque"', '"Instrument Sans"', ...defaultTheme.fontFamily.sans],
      mono: ['"IBM Plex Mono"', ...defaultTheme.fontFamily.mono],
    },
    // Full override (no 4xl+ is used anywhere in src). text-sm → 13px and text-base → 14px on purpose.
    fontSize: {
      '2xs': ['11px', { lineHeight: '16px' }],
      xs: ['12px', { lineHeight: '16px' }],
      sm: ['13px', { lineHeight: '18px' }],
      base: ['14px', { lineHeight: '20px' }],
      lg: ['16px', { lineHeight: '22px' }],
      xl: ['18px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
      '2xl': ['24px', { lineHeight: '28px', letterSpacing: '-0.015em' }],
      '3xl': ['32px', { lineHeight: '36px', letterSpacing: '-0.02em' }],
    },
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: { 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3'), inverse: v('surface-inverse') },
        line: v('line'),
        fg: { 1: v('fg-1'), 2: v('fg-2'), 3: v('fg-3'), placeholder: v('fg-placeholder'), inverse: v('fg-inverse') },
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), text: v('brand-text'), soft: v('brand-soft') },
        ring: v('ring'),
        checker: { a: v('checker-a'), b: v('checker-b') },
        scrim: v('scrim'),
        neutral: { 50: '#f8f7f4', 100: '#f1efea', 150: '#e9e6df', 200: '#e4e1d9', 300: '#cfcbc0', 400: '#a39e92', 500: '#7a756a', 600: '#5c574e', 700: '#47433c', 800: '#2c2925', 850: '#242220', 900: '#1c1a17', 950: '#121110' },
        accent: { 50: '#f4f0ff', 100: '#e9e0ff', 200: '#d5c4ff', 300: '#b799ff', 400: '#9865ff', 450: '#8646f9', 500: '#7d3cf8', 600: '#6b25e6', 700: '#5a1bc2', 800: '#49189c', 900: '#3c177d', 950: '#240a52' },
        // stage.<name>: DEFAULT dot · soft/ink light badge · dim/light dark badge (dim = DEFAULT mixed 16 % over #1c1a17)
        stage: {
          intake: stage('#8a8479', '#ece9e2', '#4a463f', '#2e2b27', '#cfcac0'),
          review: stage('#7d3cf8', '#ece3ff', '#4b1a9e', '#2c1f3b', '#c9b1ff'),
          approved: stage('#3b6fe0', '#e3ebfd', '#233f8f', '#212837', '#a9bff5'),
          generating: stage('#1f8fa8', '#dcf1f6', '#125868', '#1c2d2e', '#93d3e0'),
          needs_review: stage('#d98a1f', '#fbeed7', '#7a4a08', '#3a2c18', '#f2c57c'),
          editing: stage('#2a9d8f', '#dcf3ef', '#175e55', '#1e2f2a', '#94d6cc'),
          finishing: stage('#5b5bd6', '#e6e6fb', '#33338c', '#262436', '#b3b3f0'),
          delivered: stage('#3d9a4f', '#e1f3e4', '#1f5a2b', '#212e20', '#9fd6aa'),
          waiting: stage('#e0662b', '#fce7dc', '#7f3410', '#3b261a', '#f3ae8c'),
          failed: stage('#d4383f', '#fbe1e2', '#7f1c20', '#391f1d', '#f0999d'),
        },
        ok: { ...stage('#3d9a4f', '#e1f3e4', '#1f5a2b', '#212e20', '#9fd6aa'), text: v('ok-text') },
        warn: { ...stage('#d98a1f', '#fbeed7', '#7a4a08', '#3a2c18', '#f2c57c'), text: v('warn-text') },
        bad: { ...stage('#d4383f', '#fbe1e2', '#7f1c20', '#391f1d', '#f0999d'), text: v('bad-text') },
        info: { ...stage('#3b6fe0', '#e3ebfd', '#233f8f', '#212837', '#a9bff5'), text: v('info-text') },
      },
      borderRadius: { DEFAULT: '6px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px' },
      maxWidth: { rail: '22rem', dialog: '30rem', 'dialog-lg': '40rem', 'dialog-xl': '56rem' },
      width: { lane: '18rem', 'lane-empty': '11rem' },
      height: { control: '32px', 'control-sm': '28px', 'control-lg': '40px', header: '56px' },
      boxShadow: {
        card: '0 0 0 1px rgb(28 26 23 / 0.06), 0 1px 2px rgb(28 26 23 / 0.05)',
        pop: '0 0 0 1px rgb(28 26 23 / 0.08), 0 4px 12px -2px rgb(28 26 23 / 0.10)',
        'pop-dark': '0 0 0 1px rgb(255 255 255 / 0.10), 0 8px 24px -8px rgb(0 0 0 / 0.60)',
        modal: '0 0 0 1px rgb(28 26 23 / 0.08), 0 16px 40px -12px rgb(28 26 23 / 0.22)',
        'modal-dark': '0 0 0 1px rgb(255 255 255 / 0.10), 0 24px 56px -16px rgb(0 0 0 / 0.70)',
        key: 'inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(28 26 23 / 0.20)',
        focus: '0 0 0 3px rgb(125 60 248 / 0.25)',
        'focus-bad': '0 0 0 3px rgb(212 56 63 / 0.20)',
      },
      ringColor: { DEFAULT: 'rgb(var(--ring) / 1)' },
      ringOffsetColor: { DEFAULT: 'rgb(var(--surface-1) / 1)' },
      transitionTimingFunction: {
        'out-strong': OUT_STRONG, // every entrance and settle
        move: 'cubic-bezier(0.77, 0, 0.175, 1)', // on-screen position change
        sweep: 'cubic-bezier(0.45, 0, 0.55, 1)', // loops
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)', // mobile bottom sheet
        standard: 'cubic-bezier(0.2, 0, 0, 1)', // colour / opacity
      },
      transitionDuration: { 20: '20ms', 100: '100ms', 120: '120ms', 150: '150ms', 200: '200ms', 240: '240ms', 300: '300ms', 400: '400ms', 1000: '1000ms' },
      keyframes: {
        // loops (transform / opacity only)
        breathe: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        glow: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
        inspect: { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(400%)' } },
        slide: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(300%)' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        scan: { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(500%)' } }, // existing text-edit pass
        // entrances / exits
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'enter-dialog': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'none' } },
        'enter-sheet': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'none' } },
        leave: { to: { opacity: '0', transform: 'scale(0.98)' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { to: { opacity: '0' } },
        // one-shots
        settle: { from: { opacity: '0', filter: 'blur(12px)', transform: 'scale(1.02)' }, '60%': { filter: 'blur(0)' }, to: { opacity: '1', filter: 'none', transform: 'none' } },
        'ring-pulse': { from: { boxShadow: '0 0 0 0 rgb(125 60 248 / 0.55)' }, to: { boxShadow: '0 0 0 10px rgb(125 60 248 / 0)' } },
        'resolve-row': { from: { opacity: '0.35', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.6)' }, to: { opacity: '1', transform: 'none' } },
        draw: { from: { strokeDashoffset: '48' }, to: { strokeDashoffset: '0' } },
      },
      animation: {
        breathe: 'breathe 1600ms ease-in-out infinite',
        glow: 'glow 1600ms ease-in-out infinite',
        'glow-slow': 'glow 3200ms ease-in-out infinite',
        inspect: 'inspect 1800ms cubic-bezier(0.45,0,0.55,1) infinite alternate',
        slide: 'slide 1400ms cubic-bezier(0.45,0,0.55,1) infinite',
        shimmer: 'shimmer 1600ms linear infinite',
        scan: 'scan 1s cubic-bezier(0.45,0,0.55,1) 1 both',
        'fade-up': `fade-up 200ms ${OUT_STRONG} both`,
        'enter-dialog': `enter-dialog 200ms ${OUT_STRONG} both`,
        'enter-sheet': 'enter-sheet 240ms cubic-bezier(0.32,0.72,0,1) both',
        leave: 'leave 150ms ease-out both',
        fade: 'fade 150ms ease-out both',
        'fade-out': 'fade-out 150ms ease-out both',
        settle: `settle 400ms ${OUT_STRONG} both`,
        'ring-pulse': 'ring-pulse 600ms ease-out 1',
        'resolve-row': `resolve-row 220ms ${OUT_STRONG} both`,
        'pop-in': `pop-in 200ms ${OUT_STRONG} both`,
        draw: `draw 400ms ${OUT_STRONG} both`,
        spin: 'spin 800ms linear infinite', // overrides Tailwind's 1 s so every spinner matches
      },
    },
  },
  plugins: [],
}
