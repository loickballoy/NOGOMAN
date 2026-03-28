/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f0f7f2',
          100: '#dcede1',
          200: '#bbdbc6',
          300: '#8ec0a3',
          400: '#5f9f7c',
          500: '#3d835e',
          600: '#2d6848',
          700: '#255439',
          800: '#1e422d',
          900: '#193727',
          950: '#0c1f16',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        earth: {
          50: '#faf7f2',
          100: '#f4ede0',
          200: '#e8d8bf',
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
