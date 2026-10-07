import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Tailwind config. Semua warna merujuk CSS variables di globals.css (design tokens Stitch
 * "Serene Hearth"), sehingga component tidak boleh memakai hex/rgb langsung.
 * Breakpoints memakai default Tailwind: sm 640, md 768, lg 1024, xl 1280.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem', xl: '2rem' },
      screens: { xl: '1280px' },
    },
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          hover: 'var(--primary-hover)',
          dark: 'var(--primary-dark)',
          light: 'var(--primary-light)',
          fixed: 'var(--primary-fixed)',
        },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        sand: 'var(--sand)',
        tertiary: { DEFAULT: 'var(--tertiary)', foreground: 'var(--tertiary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        sidebar: { DEFAULT: 'var(--sidebar)', foreground: 'var(--sidebar-foreground)' },
        neutral: {
          50: 'var(--neutral-50)',
          100: 'var(--neutral-100)',
          200: 'var(--neutral-200)',
          300: 'var(--neutral-300)',
          500: 'var(--neutral-500)',
          700: 'var(--neutral-700)',
          900: 'var(--neutral-900)',
        },
        success: {
          light: 'var(--success-light)',
          DEFAULT: 'var(--success-base)',
          dark: 'var(--success-dark)',
        },
        warning: {
          light: 'var(--warning-light)',
          DEFAULT: 'var(--warning-base)',
          dark: 'var(--warning-dark)',
        },
        danger: {
          light: 'var(--danger-light)',
          DEFAULT: 'var(--danger-base)',
          dark: 'var(--danger-dark)',
        },
        info: {
          light: 'var(--info-light)',
          DEFAULT: 'var(--info-base)',
          dark: 'var(--info-dark)',
        },
      },
      fontFamily: {
        sans: ['var(--font-jost)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': [
          '2rem',
          { lineHeight: '2.5rem', letterSpacing: '-0.015em', fontWeight: '700' },
        ],
        'headline-lg-mobile': [
          '1.5rem',
          { lineHeight: '2rem', letterSpacing: '-0.01em', fontWeight: '700' },
        ],
        'headline-md': [
          '1.25rem',
          { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'headline-sm': ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.625rem', fontWeight: '400' }],
        'body-md': ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'label-md': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '400' }],
        overline: [
          '0.6875rem',
          { lineHeight: '0.875rem', letterSpacing: '0.05em', fontWeight: '600' },
        ],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(35, 45, 40, 0.04), 0 1px 2px rgba(35, 45, 40, 0.02)',
        md: '0 4px 12px -2px rgba(35, 45, 40, 0.08), 0 2px 6px -1px rgba(35, 45, 40, 0.04)',
        lg: '0 12px 28px -4px rgba(35, 45, 40, 0.12), 0 4px 10px -2px rgba(35, 45, 40, 0.06)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
