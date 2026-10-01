import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * DM Studio visual system — proposed tailwind.config.js (designer A).
 *
 * Front-end only. Adds a semantic layer on top of the existing raw scales so components
 * stop carrying `dark:` twins: every semantic colour reads an RGB triplet from index.css
 * (`--canvas`, `--surface-1` …) that flips with the theme.
 *
 * Raw scales (`neutral`, `accent`, `stage`) are kept so existing classes keep compiling
 * during migration; new code uses the semantic names.
 */

const stage = (DEFAULT, soft, ink, dim, light) => ({ DEFAULT, soft, ink, dim, light })
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // System preference by default; `<html data-theme="light|dark">` (Settings → Appearance,
  // stored in localStorage) overrides it. Requires tailwindcss ≥ 3.4.1.
  darkMode: [
    'variant',
    ['@media (prefers-color-scheme: dark) { &:not(:root[data-theme="light"] *) }', ':root[data-theme="dark"] &'],
  ],
  theme: {
    // ---- Type: 13px chrome, 14px body, display face only at 18px+ ----------------------
    fontFamily: {
      sans: ['"Instrument Sans"', ...defaultTheme.fontFamily.sans],
      display: ['"Bricolage Grotesque"', '"Instrument Sans"', ...defaultTheme.fontFamily.sans],
      mono: ['"IBM Plex Mono"', ...defaultTheme.fontFamily.mono],
    },
    fontSize: {
      '2xs': ['11px', { lineHeight: '16px' }], // badges, tags, kbd, mono facts
      xs: ['12px', { lineHeight: '16px' }], // meta, hints, subtitles
      sm: ['13px', { lineHeight: '18px' }], // labels, buttons, chips, tile titles, table cells
      base: ['14px', { lineHeight: '20px' }], // body copy, dialog text, inputs
      lg: ['16px', { lineHeight: '22px' }], // dialog titles, brief-form body (public)
      xl: ['18px', { lineHeight: '24px', letterSpacing: '-0.01em' }], // section h2 (display)
      '2xl': ['24px', { lineHeight: '28px', letterSpacing: '-0.015em' }], // page h1 (display)
      '3xl': ['32px', { lineHeight: '36px', letterSpacing: '-0.02em' }], // login / brief hero (display)
    },
    extend: {
      colors: {
        // ---- Semantic (theme-aware via CSS variables) ----------------------------------
        canvas: v('canvas'),
        surface: { 1: v('surface-1'), 2: v('surface-2'), 3: v('surface-3'), inverse: v('surface-inverse') },
        line: v('line'), // use with alpha: border-line/10 (hairline) · border-line/[.16] (strong)
        fg: { 1: v('fg-1'), 2: v('fg-2'), 3: v('fg-3'), placeholder: v('fg-placeholder'), inverse: v('fg-inverse') },
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), text: v('brand-text'), soft: v('brand-soft') },
        ring: v('ring'),
        checker: { a: v('checker-a'), b: v('checker-b') },
        scrim: v('scrim'),

        // ---- Raw scales (kept for migration; prefer the semantic names above) ----------
        neutral: {
          50: '#f8f7f4',
          100: '#f1efea',
          150: '#e9e6df', // light surface-3 (pressed / selected)
          200: '#e4e1d9',
          300: '#cfcbc0',
          400: '#a39e92',
          500: '#7a756a',
          600: '#5c574e',
          700: '#47433c',
          800: '#2c2925',
          850: '#242220', // dark surface-2 (control / well)
          900: '#1c1a17',
          950: '#121110',
        },
        accent: {
          50: '#f4f0ff',
          100: '#e9e0ff',
          200: '#d5c4ff',
          300: '#b799ff',
          400: '#9865ff',
          450: '#8646f9', // dark-mode primary hover (white text stays ≥ 4.5:1)
          500: '#7d3cf8',
          600: '#6b25e6',
          700: '#5a1bc2',
          800: '#49189c',
          900: '#3c177d',
          950: '#240a52',
        },
        // stage.<name>: DEFAULT dot · soft/ink light badge · dim/light dark badge
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
        // Feedback = aliases of stage colours (no stock emerald/amber/red anywhere).
        // `.text` flips with the theme (index.css); the badge pairs are picked with dark: as for stages.
        ok: { ...stage('#3d9a4f', '#e1f3e4', '#1f5a2b', '#212e20', '#9fd6aa'), text: v('ok-text') },
        warn: { ...stage('#d98a1f', '#fbeed7', '#7a4a08', '#3a2c18', '#f2c57c'), text: v('warn-text') },
        bad: { ...stage('#d4383f', '#fbe1e2', '#7f1c20', '#391f1d', '#f0999d'), text: v('bad-text') },
        info: { ...stage('#3b6fe0', '#e3ebfd', '#233f8f', '#212837', '#a9bff5'), text: v('info-text') },
      },

      // ---- Geometry ---------------------------------------------------------------------
      borderRadius: {
        DEFAULT: '6px', // inline code, kbd, small tags
        md: '6px',
        lg: '8px', // buttons, inputs, segmented control, menu rows
        xl: '12px', // tiles, thumbnails, wells, swatches
        '2xl': '16px', // panels, dialogs, picture frame
      },
      spacing: { 4.5: '18px', 13: '52px', 15: '60px', 18: '72px', 22: '88px', 88: '22rem' },
      maxWidth: { rail: '22rem', dialog: '30rem', 'dialog-lg': '40rem', 'dialog-xl': '56rem' },
      height: { control: '32px', 'control-sm': '28px', 'control-lg': '40px', header: '56px' },

      // ---- Elevation: ladder + hairline in dark, shadow-border + two shadows in light ---
      boxShadow: {
        // Level 0 — resting panels (light only; dark:shadow-none)
        card: '0 0 0 1px rgb(28 26 23 / 0.06), 0 1px 2px rgb(28 26 23 / 0.05)',
        // Level 1 — hovered tiles, popovers, menus, tooltips
        pop: '0 0 0 1px rgb(28 26 23 / 0.08), 0 4px 12px -2px rgb(28 26 23 / 0.10)',
        'pop-dark': '0 0 0 1px rgb(255 255 255 / 0.10), 0 8px 24px -8px rgb(0 0 0 / 0.60)',
        // Level 2 — dialogs, toasts, floating bulk bar
        modal: '0 0 0 1px rgb(28 26 23 / 0.08), 0 16px 40px -12px rgb(28 26 23 / 0.22)',
        'modal-dark': '0 0 0 1px rgb(255 255 255 / 0.10), 0 24px 56px -16px rgb(0 0 0 / 0.70)',
        // The one primary CTA per screen reads as a physical key
        key: 'inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(28 26 23 / 0.20)',
        // Input focus (3px tint ring, no offset) and invalid ring
        focus: '0 0 0 3px rgb(125 60 248 / 0.25)',
        'focus-bad': '0 0 0 3px rgb(212 56 63 / 0.20)',
      },
      ringColor: { DEFAULT: 'rgb(var(--ring) / 1)' },
      ringOffsetColor: { DEFAULT: 'rgb(var(--surface-1) / 1)' },

      // ---- Motion -----------------------------------------------------------------------
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)', // entrances
        move: 'cubic-bezier(0.77, 0, 0.175, 1)', // on-screen movement
        standard: 'cubic-bezier(0.2, 0, 0, 1)', // colour / opacity
      },
      transitionDuration: { 100: '100ms', 150: '150ms', 200: '200ms', 250: '250ms', 300: '300ms', 400: '400ms', 600: '600ms' },
      keyframes: {
        // existing (kept)
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        // dialog / popover entrance (never from scale 0)
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'none' } },
        // generating: bar sweeps the frame top→bottom, loops (bar is 1/5 frame tall)
        scan: { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(500%)' } },
        // QC judging: slower reading pass with a soft trail
        sweep: { '0%': { transform: 'translateY(-100%)', opacity: '0' }, '10%': { opacity: '1' }, '90%': { opacity: '1' }, '100%': { transform: 'translateY(500%)', opacity: '0' } },
        // live status dot while a job runs
        'pulse-dot': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        // skeleton shimmer (background-position only)
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        // one-shot accent ring pulse when a result lands / a lock succeeds
        'ring-pulse': { '0%': { boxShadow: '0 0 0 0 rgb(125 60 248 / 0.45)' }, '100%': { boxShadow: '0 0 0 12px rgb(125 60 248 / 0)' } },
        // result settles into the frame (blur → sharp; transform + filter + opacity only)
        settle: { from: { opacity: '0', transform: 'scale(0.985)', filter: 'blur(10px)' }, to: { opacity: '1', transform: 'none', filter: 'blur(0)' } },
        // success check draws itself (stroke-dashoffset on a 24px lucide path ≈ 48 units)
        draw: { from: { strokeDashoffset: '48' }, to: { strokeDashoffset: '0' } },
        // indeterminate bar that travels (replaces the pulsing 1/3 bar)
        travel: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(300%)' } },
      },
      animation: {
        'fade-up': 'fade-up 200ms cubic-bezier(0.23,1,0.32,1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.23,1,0.32,1) both',
        'sheet-up': 'sheet-up 250ms cubic-bezier(0.23,1,0.32,1) both',
        scan: 'scan 1.6s ease-in-out infinite',
        'scan-once': 'scan 1s cubic-bezier(0.4,0,0.2,1) 1 both',
        sweep: 'sweep 2.4s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'ring-pulse': 'ring-pulse 600ms cubic-bezier(0.23,1,0.32,1) 1 both',
        settle: 'settle 400ms cubic-bezier(0.23,1,0.32,1) both',
        draw: 'draw 400ms cubic-bezier(0.23,1,0.32,1) both',
        travel: 'travel 1.4s cubic-bezier(0.4,0,0.2,1) infinite',
        spin: 'spin 800ms linear infinite',
      },
    },
  },
  plugins: [],
}
