/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "Quiet luxury PA": near-black on warm off-white, one restrained
        // bronze accent. No gradients, no concierge gold, nothing shouting.
        ink: {
          DEFAULT: '#121212',
          soft: '#3d3a37',
          muted: '#78716c',
          faint: '#a8a29e',
        },
        paper: {
          DEFAULT: '#faf9f7',
          raised: '#ffffff',
          sunken: '#f2efeb',
          line: '#e5e1db',
        },
        night: {
          DEFAULT: '#0d0c0b',
          raised: '#191715',
          sunken: '#000000',
          line: '#2a2724',
        },
        bronze: {
          DEFAULT: '#8a6a45',
          soft: '#b9a184',
          wash: '#f0e9e0',
        },
        danger: '#a33a2b',
      },
      fontSize: {
        display: ['34px', { lineHeight: '40px', letterSpacing: '-0.6px' }],
        title: ['24px', { lineHeight: '30px', letterSpacing: '-0.3px' }],
      },
    },
  },
  plugins: [],
};
