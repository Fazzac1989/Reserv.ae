# The Quiet Luxury Concierge

The reference is an Aman resort, not a booking platform. Restrained, composed,
warm. If a screen could plausibly belong to a food-delivery app, it is wrong.

The product's promise is effortlessness with taste. The design has to say: this
app already knows you, it has judgement, and when it says confirmed, it means
it.

## Tokens

| Token       | Value     | Where it is allowed                        |
| ----------- | --------- | ------------------------------------------ |
| `ink`       | `#14161A` | Night background; day text                 |
| `porcelain` | `#F7F5F1` | Day background; night text                 |
| `champagne` | `#C9B58F` | The moment of commitment, and nowhere else |
| `stone`     | `#8A8D93` | Secondary text, hairlines, metadata        |
| `moss`      | `#5C6B5E` | Success, desaturated                       |
| `clay`      | `#A65D57` | Errors and cancellations, muted            |

`champagne-text` (`#B3A079`) is the same accent darkened for text-sized uses on
porcelain, where the lighter value fails AA.

### Champagne discipline

Champagne appears in exactly three places:

1. The reserve action — the tap that commits a real booking
2. The live "working" indicator, while a rail is talking to a venue
3. The rule on the confirmation card

It appears nowhere else. Not on secondary buttons, not on links, not on
selected chips, not on the send control. Because it only ever means _a booking
is at stake_, tapping it carries weight. Every screen is audited for strays.

The check mark on a confirmed booking is `moss`, not champagne: the commitment
already happened, and this is its quiet aftermath.

## Type

- **Display** — Fraunces 400/500. Venue names, screen titles, the confirmation
  headline. Never heavier than 500. The static instances ship at wonk 0, which
  is the calm end the brief asks for.
- **Body** — Inter 400/500, letterspacing tightened slightly at larger sizes.
- **Meta** — Inter at 11–12px, uppercase, letterspaced. Timestamps,
  neighbourhood labels, booking references.

Scale: 32 / 22 / 17 / 15 / 12. Body line-height 1.5 and up. Whitespace is the
luxury material — when in doubt, add space rather than elements.

## Surfaces

Radius 14 on cards, 999 on the input. No borders where a hairline of `stone` at
12% will do. Venue photography is the only decoration; full-bleed with an
`ink` 0 → 55% bottom scrim so serif names sit directly on the image.

No icons where a word is clearer. Where an icon is unavoidable: 1.5px stroke,
never filled.

## Structure

Chat-first, single surface. The conversation is the app. No tab bar.

```
CONVERSATION                            BOOKINGS
┌────────────────────────────┐          ┌────────────────────────────┐
│                  Bookings  │          │  Back                      │
│                            │          │                            │
│  Good evening, Chris       │  32 Fr   │  Bookings           32 Fr  │
│                            │          │                            │
│       ┌──────────────────┐ │          │  TONIGHT           12 meta │
│       │ Quiet dinner for │ │  raised  │  Il Borro          22 Fr   │
│       │ two tonight      │ │          │  8:30 · table for two      │
│       └──────────────────┘ │          │  ────────────────  hairline│
│                            │          │  THURSDAY                  │
│  Three in the Marina that  │  no      │  Zuma                      │
│  should suit.              │  bubble  │  7:45 · table for four     │
│                            │          │                            │
│  ┌────────┐┌────────┐┌─────│  swipe   │  EARLIER           stone   │
│  │ photo  ││ photo  ││ pho │  max 3   │  Nandos                    │
│  │        ││        ││     │          │  Sat 12 Aug                │
│  │Il Borro││ Zuma   ││ Nan │  22 Fr   │                            │
│  │MARINA·3││ JBR·4  ││ MAR │  11 meta │  Profile                   │
│  └────────┘└────────┘└─────│          │                            │
│                            │          └────────────────────────────┘
├────────────────────────────┤
│ ( Ask for something…     ) │  r999
└────────────────────────────┘

VENUE SHEET                             CONFIRMATION
┌────────────────────────────┐          ┌────────────────────────────┐
│ ┌────────────────────────┐ │          │                            │
│ │                        │ │          │  ✓ CONFIRMED    moss+meta  │
│ │        photo           │ │          │                            │
│ │                        │ │          │  Il Borro           22 Fr  │
│ │  Il Borro       22 Fr  │ │  scrim   │  Tonight, 8:30 ·           │
│ └────────────────────────┘ │          │  table for two      15     │
│                            │          │                            │
│  Quiet at the back, and    │          │  ──────────────  champagne │
│  they know how to pace a   │  17      │                            │
│  long dinner.              │          │  Add to calendar           │
│                            │          │  Directions         15     │
│  TONIGHT           12 meta │          │                            │
│  ( 8:00 )( 8:30 )( 9:15 )  │  pills   └────────────────────────────┘
│                            │
│  ┌──────────────────────┐  │          LIVE
│  │   Reserve 8:30       │  │ CHAMPAGNE┌────────────────────────────┐
│  └──────────────────────┘  │          │  ◦ Calling Il Borro…       │
│                            │          └────────────────────────────┘
└────────────────────────────┘            champagne dot, 1.4s pulse
```

## Motion

Three things move, and nothing else:

- The confirmation settle — 250ms ease-out, scale from 0.97
- The live indicator pulse — opacity, 1.4s
- Card appearance — 150ms fade

All of it is skipped under `prefers-reduced-motion`.

## Voice

A seasoned maître d': short, composed, first-name warm. Never chatty, never
salesy, no exclamation marks, no emoji.

> "I've held 8:30 at Zuma — shall I confirm?"

not

> "Great news!! I found some amazing options"

Errors are direct and lead with the way out: "The 8pm slot has gone. 7:45 or
9:15 are open — which suits?" Buttons say exactly what will happen: _Reserve_,
_Confirm 8:30_, _Cancel booking_.

## What was removed

The brief asks for one element to come off every screen. What went:

- **Conversation** — the assistant's speech bubble. The concierge is not a
  correspondent to be quoted; its words are simply the page. Only the user's
  own words are boxed, because a record of what _you_ said is worth keeping
  distinct.
- **Conversation** — the "Concierge" eyebrow above the greeting. The app has
  one voice and no other screen to be confused with.
- **Venue sheet** — the price band from the body. It is already in the meta
  line on the card that opened the sheet.
- **Bookings** — the per-row chevron. The whole row is the target.
- **Confirmation** — the venue's neighbourhood. At the moment of confirming,
  the person knows where they are going.
