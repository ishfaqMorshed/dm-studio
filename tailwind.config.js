import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * DM Studio brand tokens.
 *
 * - `neutral` is REPLACED with a warm "ink & paper" scale so every existing
 *   neutral-* class in the app picks up the studio's tone instead of Tailwind's
 *   cool default greys.
 * - `accent` is the Design Musketeer violet: primary actions, focus rings, the mark.
 * - `stage.<name>` carries the board's stage colours (DEFAULT = dot/strip,
 *   soft = badge background, ink = badge text, light = badge text in dark mode).
 * - `font-display` (Bricolage Grotesque) for headings and the wordmark,
 *   `font-sans` (Instrument Sans) for everything else; both load from index.html.
 */

const stage = (DEFAULT, soft, ink, light) => ({ DEFAULT, soft, ink, light })

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', ...defaultTheme.fontFamily.sans],
        display: ['"Bricolage Grotesque"', '"Instrument Sans"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        neutral: {
          50: '#f8f7f4',
          100: '#f1efea',
          200: '#e4e1d9',
          300: '#cfcbc0',
          400: '#a39e92',
          500: '#7a756a',
          600: '#5c574e',
          700: '#47433c',
          800: '#2c2925',
          900: '#1c1a17',
          950: '#121110',
        },
        accent: {
          50: '#f4f0ff',
          100: '#e9e0ff',
          200: '#d5c4ff',
          300: '#b799ff',
          400: '#9865ff',
          500: '#7d3cf8',
          600: '#6b25e6',
          700: '#5a1bc2',
          800: '#49189c',
          900: '#3c177d',
          950: '#240a52',
        },
        stage: {
          intake: stage('#8a8479', '#ece9e2', '#4a463f', '#cfcac0'),
          review: stage('#7d3cf8', '#ece3ff', '#4b1a9e', '#c9b1ff'),
          approved: stage('#3b6fe0', '#e3ebfd', '#233f8f', '#a9bff5'),
          generating: stage('#1f8fa8', '#dcf1f6', '#125868', '#93d3e0'),
          needs_review: stage('#d98a1f', '#fbeed7', '#7a4a08', '#f2c57c'),
          editing: stage('#2a9d8f', '#dcf3ef', '#175e55', '#94d6cc'),
          finishing: stage('#5b5bd6', '#e6e6fb', '#33338c', '#b3b3f0'),
          delivered: stage('#3d9a4f', '#e1f3e4', '#1f5a2b', '#9fd6aa'),
          waiting: stage('#e0662b', '#fce7dc', '#7f3410', '#f3ae8c'),
          failed: stage('#d4383f', '#fbe1e2', '#7f1c20', '#f0999d'),
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(28 26 23 / 0.06), 0 1px 3px rgb(28 26 23 / 0.04)',
      },
      // Only ever used as `motion-safe:animate-scan` / `motion-safe:animate-fade-up`.
      // The scan bar is one fifth of the picture frame tall, so -100 % → 500 % of its own
      // height carries it from just above the frame to just below it.
      keyframes: {
        scan: { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(500%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        scan: 'scan 1s cubic-bezier(0.4,0,0.2,1) 1 both',
        'fade-up': 'fade-up 200ms ease-out both',
      },
    },
  },
  plugins: [],
}
