/**
 * Bihan — Tailwind theme snippet (Tailwind CSS v3)
 * Source of truth: design/tokens.json
 *
 * FONTS — add this to frontend/index.html <head>:
 *   <link rel="preconnect" href="https://fonts.googleapis.com">
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
 *   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Unbounded:wght@500;600;700;800&display=swap" rel="stylesheet">
 *
 * SPACING — Tailwind's default scale is already the Bihan 4px grid
 * (p-1 = 4px, p-2 = 8px, p-3 = 12px, p-4 = 16px, p-5 = 20px, p-6 = 24px, p-8 = 32px, p-12 = 48px),
 * so spacing is not overridden.
 *
 * DARK — v1 is dark only. Set <body class="bg-bg text-ink font-sans antialiased">.
 *
 * GRADES — classes like `text-grade-${g}` are built at runtime, so they are safelisted below.
 */

const grades = ['s', 'a', 'b', 'c', 'd', 'cal'];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: grades.flatMap((g) => [
    `text-grade-${g}`,
    `bg-grade-${g}`,
    `border-grade-${g}`,
    `stroke-grade-${g}`,
    `fill-grade-${g}`,
    ...(g === 'cal' ? [] : [`bg-grade-${g}-dim`, `stroke-grade-${g}-dim`, `fill-grade-${g}-dim`]),
  ]),
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        surface: {
          1: '#14141c',
          2: '#1d1d28',
          3: '#272735',
        },
        border: {
          DEFAULT: '#2c2c3a',
          strong: '#62627a',
        },
        ink: {
          DEFAULT: '#f4f4f7',
          muted: '#a3a3b5',
          subtle: '#86869c',
          'on-gold': '#16110a',
        },
        gold: {
          DEFAULT: '#ffc93c',
          hover: '#ffd768',
        },
        grade: {
          s: '#ffc93c',
          a: '#3ddc84',
          b: '#41b6ff',
          c: '#ff9f43',
          d: '#ff4d5e',
          cal: '#8a8aa0',
          's-dim': 'rgba(255, 201, 60, 0.16)',
          'a-dim': 'rgba(61, 220, 132, 0.16)',
          'b-dim': 'rgba(65, 182, 255, 0.16)',
          'c-dim': 'rgba(255, 159, 67, 0.16)',
          'd-dim': 'rgba(255, 77, 94, 0.16)',
        },
        chart: {
          grid: '#23232f',
          line: '#f4f4f7',
        },
        overlay: 'rgba(5, 5, 9, 0.72)',
        error: '#ff4d5e',
      },
      fontFamily: {
        display: ['Unbounded', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]
        'score-hero': ['88px', { lineHeight: '88px', letterSpacing: '-0.03em', fontWeight: '800' }],
        'score-hero-mobile': ['64px', { lineHeight: '64px', letterSpacing: '-0.03em', fontWeight: '800' }],
        'score-md': ['40px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'score-sm': ['22px', { lineHeight: '26px', fontWeight: '700' }],
        'grade-letter': ['28px', { lineHeight: '28px', fontWeight: '800' }],
        display: ['36px', { lineHeight: '42px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-mobile': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'heading-lg': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'heading-md': ['17px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['15px', { lineHeight: '22px' }],
        'body-sm': ['13px', { lineHeight: '18px' }],
        label: ['11px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }], // pair with `uppercase`
        stat: ['15px', { lineHeight: '20px', fontWeight: '600' }], // pair with `tabular-nums`
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '20px',
        xl: '28px',
        full: '9999px',
      },
      boxShadow: {
        modal: '0 24px 64px rgba(0, 0, 0, 0.6)',
        'glow-s': '0 0 32px rgba(255, 201, 60, 0.45)',
        focus: '0 0 0 3px rgba(255, 201, 60, 0.55)',
      },
      maxWidth: {
        content: '1200px',
      },
      keyframes: {
        'ring-fill': {
          from: { strokeDashoffset: 'var(--ring-circumference)' },
          to: { strokeDashoffset: 'var(--ring-offset)' },
        },
      },
      animation: {
        'ring-fill': 'ring-fill 600ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
