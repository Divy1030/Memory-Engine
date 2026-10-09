import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f6f3ee',
        canvas: '#111110',
        panel: '#191917',
        line: '#2b2a27',
        accent: '#e7a76c',
        mint: '#9ac6b2',
      },
      fontFamily: { sans: ['var(--font-geist)'] },
    },
  },
  plugins: [],
}

export default config
