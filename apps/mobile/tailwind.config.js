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
        /**
         * Black, white and grey. See DESIGN.md.
         *
         * The earlier palette was warm — a cream ground and a champagne
         * accent — and warmth reads as dated next to the products this is
         * measured against. These are neutral: no blue in the black, no yellow
         * in the white, so a photograph is the only colour on the screen.
         */
        ink: {
          DEFAULT: '#0B0B0C',
          // The one surface that lifts off the base. A hair, not a step.
          raised: '#171719',
        },
        paper: {
          DEFAULT: '#F6F6F7',
          raised: '#FFFFFF',
        },
        grey: {
          DEFAULT: '#8A8A8E',
          // Hairlines. Anywhere a border would otherwise be drawn.
          line: 'rgba(138, 138, 142, 0.16)',
        },
        /**
         * The only chromatic colour in the application, and it means something
         * went wrong. Success is not a colour here — it is full contrast, which
         * is scarcer than any hue in a palette made of three greys.
         */
        alert: '#C2453D',
      },
      fontFamily: {
        display: ['Fraunces_400Regular'],
        'display-medium': ['Fraunces_500Medium'],
        body: ['Inter_400Regular'],
        'body-medium': ['Inter_500Medium'],
      },
      fontSize: {
        // 32 / 22 / 17 / 15 / 12, with room to breathe.
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.4px' }],
        title: ['22px', { lineHeight: '30px', letterSpacing: '-0.2px' }],
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
