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
         * Forest green on warm ivory. See DESIGN.md.
         *
         * The fourth palette, and the approved one. It was cream and
         * champagne, then black and grey, then terracotta on sand from a
         * reference image, and it is this because the design board and the
         * written brief agree — the earlier answer was given without the board
         * in front of us.
         *
         * What survives from the terracotta build is the thing that actually
         * mattered: the ground is tinted and the cards are white. A photograph
         * on a tinted ground picks up the tint; on a white card it keeps its
         * own colour. That was the structural fix for the objection that
         * killed the first warm palette, and it holds here.
         */
        ink: {
          // Charcoal with a green cast rather than neutral black. On ivory a
          // true black reads as a hole; this sits in the same family as the
          // primary without competing with it.
          DEFAULT: '#2B2E2A',
          raised: '#171A16',
        },
        paper: {
          DEFAULT: '#FAF8F3',
          raised: '#FFFFFF',
        },
        grey: {
          DEFAULT: '#8A8F86',
          line: 'rgba(138, 143, 134, 0.24)',
        },
        /**
         * The primary, and the fourth thing it is spent on is the current tab.
         *
         * Dark enough to carry white text at any size, which is why there is no
         * separate text variant here: the same green works as a fill and as a
         * word, and a palette with two greens is a palette somebody eventually
         * picks the wrong one from.
         */
        accent: {
          DEFAULT: '#183F35',
          // The muted panel from the board — a sage wash for anything that
          // needs to sit apart from the page without becoming a card.
          panel: '#E7EDE8',
        },
        /**
         * Waiting on somebody else.
         *
         * Its own colour because "confirmed" and "awaiting the venue" are the
         * two states a person scans this app for, and telling them apart by
         * reading is slower than telling them apart by colour. Amber rather
         * than red: nothing has gone wrong, it simply has not happened yet.
         */
        pending: {
          DEFAULT: '#C77D3A',
          // The amber laid over the ivory ground, mixed once here rather than
          // asked for as an opacity at the call site. `bg-pending/12` looked
          // right in the source and emitted no rule at all, because 12 is not a
          // step on Tailwind's opacity scale — a class that silently does
          // nothing is worse than one that errors. Every tone now names a solid
          // colour, which is also what the confirmed pill already did.
          panel: '#F1E2D2',
        },
        alert: {
          DEFAULT: '#C2453D',
          panel: '#F0D8D2',
        },
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
        // 16, per the brief. The terracotta build used 20, which reads softer
        // and slightly more toylike; 16 is the editorial register the board is
        // in.
        card: '16px',
        input: '999px',
      },
    },
  },
  plugins: [],
};
