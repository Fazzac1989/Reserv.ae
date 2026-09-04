# Partner outreach — booking platform API access

Drafts for asking reservation platforms whether they will let Reserv book
through their API, and who to ask.

---

## Before you send anything

**Send from `chris@reserv.ae`, not Gmail.**

Cold B2B mail from a personal Gmail gets read as a hobbyist. You own the
domain; Google Workspace is about $7 a month and takes twenty minutes. This
single change will do more for the reply rate than anything in the wording
below.

**The framing that matters.** Every one of these companies sells software to
restaurants and is nervous about anyone who might come between them and their
customer. Reserv is not a marketplace and does not want the guest
relationship — it sends covers to their venues and disappears. Lead with that,
because it is the objection they will raise silently and never say out loud.

**Do not oversell.** They see a lot of pre-launch bluster. One demo venue and
an honest position reads better than implied traction that unravels on the
call.

---

## The email — restaurants

Adjust the second paragraph per company; the rest holds.

> **Subject:** API access for a Dubai concierge app — partnership question
>
> Hello,
>
> I'm building Reserv, an AI concierge for Dubai. It suggests restaurants to a
> member and then books the table for them. We're pre-launch, running a pilot
> in Dubai Marina and DIFC.
>
> I'd like to know whether you offer API access to a third party booking on a
> guest's behalf, and on what terms.
>
> To be clear about what we are and aren't: we're not a marketplace and we
> don't sell listings. We send covers to venues that already use you, and the
> guest relationship stays with the restaurant. Every booking would carry your
> reservation reference, and we'd hold no availability of our own.
>
> Practically, we'd need to check availability and place a reservation for a
> named guest, and receive a webhook when it's confirmed or changed. We already
> handle bookings where no API exists — the integration would replace a slower
> path, not create demand you don't already serve.
>
> Could you point me to whoever handles partner integrations? Happy to sign an
> NDA and share the product properly.
>
> Best regards,
>
> Chris Farrell
> Founder, Reserv
> reserv.ae

### Per-company second paragraph

**Eat App** — they are the closest to home and the likeliest yes.

> Most of the venues in our pilot are on Eat App, and you're the platform our
> restaurants mention first. I'd rather build one integration properly with a
> team in the region than three badly.

**SevenRooms** — enterprise, and the venues that use them are the ones a
concierge product cares about.

> The venues we most want to book are on SevenRooms, and they're the ones where
> a concierge request needs to arrive properly rather than as a phone call at
> service.

**OpenTable** — expect this to be the hardest, and say so implicitly by being
more precise about the boundary.

> We're aware you run consumer demand of your own. We're not competing for it:
> Reserv is a paid assistant for people who already know where they want to eat
> or want us to choose for them, and it books rather than browses.

---

## The email — salons, spas and wellness

Same structure, different substance.

> **Subject:** API access for a Dubai lifestyle assistant — partnership question
>
> Hello,
>
> I'm building Reserv, an AI personal assistant for Dubai. Among other things
> it books appointments on a member's behalf — salon, barber, spa — including
> the standing ones people never get round to rebooking.
>
> I'd like to know whether you offer partner API access for booking on a
> client's behalf, and on what terms.
>
> We're not a marketplace and don't sell listings. We'd send appointments to
> businesses already using you, with the client relationship staying where it
> is. What we need is availability, a booking for a named client, and a webhook
> when it's confirmed or moved.
>
> The useful part for your businesses is repeat frequency: our assistant knows
> a member gets a cut every three weeks and asks whether to rebook, which is
> the appointment that otherwise gets forgotten.
>
> Could you point me to whoever handles partner integrations?
>
> Best regards,
>
> Chris Farrell
> Founder, Reserv
> reserv.ae

---

## Who to write to

Ordered by how likely I think a reply is, which is not the same as how big
they are.

### Restaurants

| Platform       | Why                                                         |
| -------------- | ----------------------------------------------------------- |
| **Eat App**    | Regional, strong in Dubai, closest to your size. Start here |
| **SevenRooms** | The venues you most want. US enterprise, slower             |
| **ReserveOut** | MENA-based, worth a note                                    |
| **OpenTable**  | Runs its own consumer demand. Hardest, ask anyway           |
| **The Fork**   | Tripadvisor-owned, Europe-weighted, thin in the UAE         |

### Salons, spas, wellness

| Platform     | Why                                                      |
| ------------ | -------------------------------------------------------- |
| **Fresha**   | Very widely used in Dubai, marketplace model, ask first  |
| **Zenoti**   | Enterprise spa and salon software with real UAE presence |
| **Booksy**   | Barbers especially                                       |
| **Mindbody** | Fitness and wellness, US-weighted but present            |

### Golf

Worth knowing before you spend time: Dubai's clubs mostly run their own tee
sheets rather than a shared platform, so this is likely venue-by-venue rather
than one integration. **Golf in Dubai** and the individual clubs — Emirates
Golf Club, Dubai Creek, Jumeirah Golf Estates — are the conversation, and it is
a commercial one rather than a technical one.

### Travel, when you get there

Two of these are genuinely open to a company your size, which is unusual and
worth knowing now:

| Platform                 | Why                                                 |
| ------------------------ | --------------------------------------------------- |
| **Duffel**               | Flights. Modern API, self-serve, built for startups |
| **Amadeus Self-Service** | Flights and hotels, free test tier, sign up today   |
| **Hotelbeds**            | B2B hotel inventory, works with small distributors  |
| **Expedia Rapid**        | Hotels, needs a partner agreement                   |

Do not write to these yet. They are Phase 6 and mentioning travel now
complicates the restaurant conversation.

---

## What to expect

**Most will not reply.** That is normal for partner-integration mail and is not
a signal about the product. Send, wait ten days, send one short follow-up, then
stop.

**The likeliest real answer is "our API is for our venues, not for third
parties."** That is not a no. The follow-up question is whether a venue may
grant you access from their own account — which turns one platform conversation
into a per-venue one, slower but entirely workable, and it is how most people
get started.

**Someone may ask about commercials.** Have an answer ready even if it is "we
haven't priced this and would rather agree how it works first." Making one up
on a call is worse than not having one.

**If Eat App says yes, stop writing to the others** until it works. One
integration proven end to end is worth more than three conversations, and the
second adapter is a fraction of the work once the rail is real.
