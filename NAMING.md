# Naming the assistant

Suhail collides with NVIDIA Suhail, a speech-AI platform whose own marketing says
"intelligent virtual assistants". Today the markets differ — theirs is
developer infrastructure, ours is a consumer app. They converge the moment
Reserv ships voice, which is Phase 5 of its own plan.

This is the shortlist for replacing it, and the case for not bothering.

---

## The case for keeping Suhail

Worth stating first, because a rename that was not needed is pure cost.

The products do not compete, do not sell to the same buyer, and would not
plausibly be confused at the point of purchase. If a trademark search comes
back clean in the relevant classes, keeping it is defensible.

What a search cannot tell you is how it feels in three years, when Reserv has a
voice assistant and every search for "Suhail voice" returns a GPU company. That
is the actual cost, and it is a judgement rather than a legal question.

**The name is days old.** `BRAND` in `packages/config` means changing it is a
config value and a copy pass. That will never be cheaper than it is now.

---

## What the name has to do

**Be said aloud.** People will say "ask ___". Two syllables, unambiguous when
heard across a room, and spelled the way it sounds — a name somebody has to
spell out has already failed.

**Work in two languages.** Dubai. It must be comfortable in an Arabic mouth and
an English one, and mean nothing unfortunate in either.

**Not be a category word.** "Concierge" and "Butler" are unsearchable and
unownable.

**Have trademark headroom** in classes 9 and 42 (software) and 35 (business
services).

**It does not need its own domain.** The product is Reserv; the assistant lives
inside it. That removes the constraint that usually mangles a good name.

---

## Shortlist

Checked against a web search for existing AI products. That finds products, not
registrations — a proper search is still required before committing.

### Orla

Irish, roughly "golden". Two syllables, soft, no spelling ambiguity, and it
carries warmth without being sweet.

- **Collisions found:** none in AI or assistants
- **Says well:** "Ask Orla." Clean in both languages
- **Against it:** unfamiliar in the Gulf, so it reads as imported rather than
  local. Feminine-coded, if that matters to you

The strongest on the list on pure availability.

### Suhail

The star Canopus — the second brightest in the sky, and the one Arab navigators
steered by for centuries. Also a common UAE given name.

- **Collisions found:** none in AI or assistants
- **Says well:** two syllables, instantly familiar to every Emirati and Arab
  speaker, and pronounceable by everyone else
- **Against it:** masculine-coded. Slightly longer to say than Orla

The most interesting candidate. A guide you navigate by is exactly what this
product claims to be, and the meaning lands locally without being kitsch —
which is rare, because most attempts at regional naming are.

### Saba

Arabic, the gentle morning breeze. Also the historic Sheba.

- **Collisions found:** none obvious, but it is a common word and a common name
- **Says well:** two syllables, soft, easy everywhere
- **Against it:** commonness cuts both ways. Harder to own, easier to like

### Vero

From _veritas_. Short, crisp, faintly Italian, unisex.

- **Collisions found:** Vero, the social network. Largely dormant but the name
  is known and registered
- **Against it:** that registration. Probably fatal in class 9

Listed because it reads well, not because it is available.

### Hale

English, "whole, in good health". Calm, one syllable, very quiet-luxury.

- **Collisions found:** used in health technology
- **Against it:** the health association pulls the wrong way for a concierge,
  and one syllable is thin when spoken to a device

### Names to avoid

**Nour / Noor.** Beautiful, and the first thing anyone suggests for a Gulf
product. But `Nouraa.ai` is an AI answering service — the same category — and
`NoorAI` exists as an assistant app. Too crowded, in exactly the wrong place.

**Marlow.** Ruled out on discovery: there is a product called _Marlow Executive
Assistants_, which is precisely this space, plus a separate Marlow AI builder.

**Ada, Iris, Juno, Otto.** All heavily used in AI. The obvious human names went
first.

---

## Recommendation

**Suhail**, if the trademark search allows it.

It is the only candidate that means something to the market Reserv is actually
in. Dubai is full of products with Latin-root names chosen in London; a name
Emiratis recognise, that happens to mean the star you navigate by, is a
genuinely better story than a pretty sound with no argument behind it.

**Orla** if you would rather the assistant read as neutral and imported, which
is a legitimate choice for a product aimed at expatriate professionals.

## Before committing

1. **WIPO Global Brand Database** — free, covers most registries
2. **UAE Ministry of Economy** trademark search
3. **USPTO** if the US matters later
4. Search the App Store for the name as an app title

Then it is one value in `packages/config/src/brand.ts` and a copy pass through
the prompts and the onboarding screens. Half a day, most of it reading.
