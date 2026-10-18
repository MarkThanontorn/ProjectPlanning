/** @type {import('tailwindcss').Config} */
// Colours point at CSS variables (src/theme.css) so the whole app can switch to dark mode in one place.
const FAMILIES = ['slate', 'emerald', 'rose', 'sky', 'amber', 'violet', 'blue'];
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const themed = Object.fromEntries(
  FAMILIES.map((f) => [f, Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--c-${f}-${s}) / <alpha-value>)`]))]),
);

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { ...themed, white: 'rgb(var(--c-white) / <alpha-value>)' },
      fontFamily: { sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
