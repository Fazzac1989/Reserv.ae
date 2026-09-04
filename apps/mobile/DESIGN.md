# Black, White and Grey

The reference is a gallery wall, not a booking platform. Restrained, composed,
neutral. If a screen could plausibly belong to a food-delivery app, it is wrong.

The product's promise is effortlessness with taste. The design has to say: this
app already knows you, it has judgement, and when it says confirmed, it means
it.

An earlier version of this document specified a warm palette — a cream ground
and a champagne accent. It was replaced because warmth reads as dated beside
the products this is measured against, and because a warm ground tints every
photograph laid on it. The palette below has no hue at all: no blue in the
black, no yellow in the white. A venue's photograph is the only colour on the
screen, which is the intended effect.

## Tokens

| Token          | Value                    | Where it is allowed                  |
| -------------- | ------------------------ | ------------------------------------ |
| `ink`          | `#0B0B0C`                | Night background; day text           |
| `ink-raised`   | `#171719`                | The one surface that lifts, at night |
| `paper`        | `#F6F6F7`                | Day background; night text           |
| `paper-raised` | `#FFFFFF`                | The one surface that lifts, by day   |
| `grey`         | `#8A8A8E`                | Secondary text, metadata             |
| `grey-line`    | `rgba(138,138,142,0.16)` | Hairlines, and every border           |
| `alert`        | `#C2453D`                | Errors and cancellations, and only    |

`alert` is the only chromatic colour in the application, and it means something
went wrong. There is no counterpart for success.

### Contrast discipline

In a palette of three greys, **contrast is the accent**. It is scarcer than any
hue would be, and it is spent in exactly three places:

1. The reserve action — the tap that commits a real booking
2. The live "working" indicator, while a rail is talking to a venue
3. The `Confirmed · 8:30 tonight` line on the confirmation card

(The previous version of this list named a rule on the confirmation card. There
is no such rule in the code and there never was; the accent was on the headline
line. The list now describes what is actually rendered.)

Full contrast means ink on paper by day and paper on ink by night — the ground
and the mark trading places. It appears nowhere else. Not on secondary buttons,
not on links, not on selected chips, not on the send control. Because it only
ever means _a booking is at stake_, tapping it carries weight. Every screen is
audited for strays, and the button variant is named `commit` so a stray use
shows up in the diff rather than only on the screen.

Confirmation is marked by the rule and the word, not by a colour. Green would
say the same thing every other app says.

## Type

- **Display** — Fraunces 400/500. Venue names, screen titles, the confirmation
  headline. Never heavier than 500. The static instances ship at wonk 0, which
  is the calm end the brief asks for.
- **Body** — Inter 400/500, letterspacing tightened slightly at larger sizes.
- **Meta** — Inter at 11–12px, uppercase, letterspaced. Timestamps,
  neighbourhood labels, booking references.

Scale: 32 / 22 / 17 / 15 / 12. Body line-height 1.5 and up. Whitespace is the
luxury material — when in doubt, add space rather than elements.

The serif is deliberately unresolved. The palette brief named Inter, Geist and
Manrope with no serif at all; the display face was left as Fraunces so that the
palette could be judged on its own. If the screens still read as dated, the
typography is the next variable to change, and it should be changed by itself.

## Surfaces

Radius 14 on cards, 999 on the input. No borders where a `grey-line` hairline
will do. Venue photography is the only decoration; full-bleed with an `ink`
0 → 55% bottom scrim so serif names sit directly on the image. A card whose
photograph has not loaded is `ink`, not a placeholder graphic — an empty frame
with an icon in it looks like a failure, and a quiet dark card does not.

No icons where a word is clearer. Where an icon is unavoidable: 1.5px stroke,
never filled.

## Structure

Five tabs: Home, Suhail, Plans, Discover, You. The conversation is still the
centre of the product — Suhail is where a booking is actually made — but the
assistant needs somewhere to keep what it has learned (You), somewhere to show
what is already arranged (Plans), and somewhere to browse when nobody wants to
type (Discover). Home is the one screen that answers "what is happening today"
without being asked.

```
HOME                                    DISCOVER
┌────────────────────────────┐          ┌────────────────────────────┐
│                            │          │  Discover           32 Fr  │
│  Good morning, Chris 32 Fr │          │  Places Suhail can get you │
│                            │          │  into.              17     │
│ ( Ask Suhail anything…   ) │  r999    │                            │
│  Or just start talking     │  grey    │  ┌────────────────────────┐│
│                            │          │  │                        ││
│  TONIGHT           12 meta │          │  │   photo, full bleed    ││ 420
│  Il Borro           22 Fr  │          │  │                        ││
│  8:30 · table for two      │          │  │ Wheelhouse      22 Fr  ││ scrim
│                            │          │  │ BLUEWATERS·OCCASION    ││ 12
│                            │          │  └────────────────────────┘│
├────────────────────────────┤          │  The room to book when     │
│ HOME SUHAIL PLANS DISC YOU │  tabs    │  someone is congratulated. │
└────────────────────────────┘          │                            │
                                        │  TABLES            12 meta │
VENUE SHEET                             │  ┌──────┐┌──────┐┌──────   │ shelf
┌────────────────────────────┐          │  │photo ││photo ││photo    │ 264
│ ┌────────────────────────┐ │          │  └──────┘└──────┘└──────   │
│ │        photo           │ │          └────────────────────────────┘
│ │  Il Borro       22 Fr  │ │  scrim
│ └────────────────────────┘ │          CONFIRMATION
│                            │          ┌────────────────────────────┐
│  Quiet at the back, and    │  17      │  CONFIRMED · 8:30   FULL   │
│  they know how to pace a   │          │  TONIGHT         CONTRAST  │
│  long dinner.              │          │  Il Borro           32 Fr  │
│                            │          │  Table for two      15     │
│  TONIGHT           12 meta │          │                            │
│  ( 8:30 )                  │  pills   │                            │
│  I will ask for this.      │  grey    │                            │
│                            │          │                            │
│  ┌──────────────────────┐  │ FULL     │  Asked 18:12. Answered 14  │
│  │   Reserve 8:30       │  │ CONTRAST │  minutes later.     grey   │
│  └──────────────────────┘  │          │                            │
│         Not this one       │  grey    │  Add to calendar           │
└────────────────────────────┘          │  Directions         15     │
                                        └────────────────────────────┘
LIVE
┌────────────────────────────┐
│  ◦ Calling Il Borro…       │  full-contrast dot, 1.4s pulse
└────────────────────────────┘
```

## The booking moment

Anything can suggest a restaurant. Nothing else rings one on your behalf and
comes back with a table, so the confirmation is the one screen built to be
shown to somebody else — and the one place the design stops being quiet.

It is the venue's own photograph, full-bleed, with the name in Fraunces at 32.
Underneath, the part that is actually remarkable: not that a table exists, but
how long it took to get one.

> Asked at 18:12. Answered 14 minutes later.

Three rules hold it together:

**It appears only when the venue has said yes.** Approving starts the work; it
does not finish it. Until `confirmed_at` is set the screen shows what is
genuinely happening, in the booking's own words. A card that said "Confirmed"
the instant somebody tapped Reserve would be the one lie this product cannot
afford, and it would be found out by the person standing at the door.

**Everything on it is evidence.** The photograph is the venue's. The time is
the one they gave. The turnaround is measured, not phrased. Remove any of it
and what is left is a receipt.

**It can leave the app.** Share hands over the whole sentence, because a
screenshot that has to be explained is not the moment.

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

- **Everywhere** — the accent colour. See Contrast discipline above.
- **Suhail** — the assistant's speech bubble. The concierge is not a
  correspondent to be quoted; its words are simply the page. Only the user's
  own words are boxed, because a record of what _you_ said is worth keeping
  distinct.
- **Suhail** — the "Concierge" eyebrow above the greeting. The app has one
  voice and no other screen to be confused with.
- **Venue sheet** — the price band from the body. It is already in the meta
  line on the card that opened the sheet.
- **Plans** — the per-row chevron. The whole row is the target.
- **Confirmation** — the venue's neighbourhood. At the moment of confirming,
  the person knows where they are going.
