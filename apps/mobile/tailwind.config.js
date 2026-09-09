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
         * Terracotta on warm sand. See DESIGN.md.
         *
         * This is the third palette. It was cream and champagne, then black and
         * grey, and it is warm again — which is worth being honest about rather
         * than quietly reversing. The monochrome was correct about one thing and
         * wrong about another: it was right that a tinted ground fights a
         * photograph, and wrong that the answer was to remove all warmth. A
         * gallery wall is the right reference for a gallery. It is not the right
         * reference for somewhere you take somebody to dinner.
         *
         * The ground is tinted and the cards are white, which is what stops the
         * tint reaching the photography: a photograph sits on white here, not on
         * sand, so it keeps its own colour.
         */
        ink: {
          // Warm near-black rather than neutral. On a sand ground a blue-black
          // reads as a hole punched in the page.
          DEFAULT: '#2A211D',
          raised: '#1C1613',
        },
        paper: {
          // The ground. Everything sits on this.
          DEFAULT: '#F9E7DE',
          // Cards, sheets, anything that lifts. White on purpose — it is what
          // keeps a photograph's colour honest against a tinted page.
          raised: '#FFFFFF',
        },
        grey: {
          DEFAULT: '#A08A80',
          line: 'rgba(160, 138, 128, 0.22)',
        },
        /**
         * The accent, back after a spell with none.
         *
         * Monochrome spent contrast where an accent would go, which worked and
         * was austere. This is the warmer answer: terracotta carries the
         * moment of commitment and nothing else. The discipline is unchanged —
         * it appears on the reserve action, the live indicator and the
         * confirmed line, and is audited for strays everywhere else.
         */
        accent: {
          DEFAULT: '#DE8B63',
          // Darkened for text-sized uses, where the lighter value fails AA on
          // a sand ground.
          text: '#B96A44',
        },
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
        // Rounder than the monochrome build. A 14px corner reads as
        // architectural; this reads as an object you could pick up, which is
        // the register the whole palette moved to.
        card: '20px',
        input: '999px',
      },
    },
  },
  plugins: [],
};
