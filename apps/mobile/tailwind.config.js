/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Follows the system. Night is the flagship look, and asking someone to
  // choose it is asking them to notice the app rather than the booking.
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // See DESIGN.md. Six values, and champagne is spoken for.
        ink: {
          DEFAULT: '#14161A',
          // A shade up from the base, for the one surface that lifts off it.
          raised: '#1C1F24',
        },
        porcelain: {
          DEFAULT: '#F7F5F1',
          raised: '#FFFFFF',
        },
        /**
         * The moment of commitment, and nowhere else: the reserve action, the
         * live working indicator, the rule on the confirmation card.
         */
        champagne: {
          DEFAULT: '#C9B58F',
          // The same accent darkened to hold AA at text sizes on porcelain.
          text: '#B3A079',
        },
        stone: {
          DEFAULT: '#8A8D93',
          // Hairlines. Anywhere a border would otherwise be drawn.
          line: 'rgba(138, 141, 147, 0.12)',
        },
        moss: '#5C6B5E',
        clay: '#A65D57',
      },
      fontFamily: {
        display: ['Fraunces_400Regular'],
        'display-medium': ['Fraunces_500Medium'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
      },
      fontSize: {
        // 32 / 22 / 17 / 15 / 12, with room to breathe.
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.2px' }],
        title: ['22px', { lineHeight: '30px', letterSpacing: '-0.1px' }],
        lead: ['17px', { lineHeight: '26px' }],
        body: ['15px', { lineHeight: '23px' }],
        meta: ['12px', { lineHeight: '16px', letterSpacing: '1.4px' }],
      },
      borderRadius: {
        card: '14px',
        input: '999px',
      },
    },
  },
  plugins: [],
};
