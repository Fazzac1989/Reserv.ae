# The voice rail — ElevenLabs integration spec

`booker_voice` calls a restaurant and asks for a table. This specifies how,
using ElevenLabs Agents for the call itself and nothing else.

Not built. This is the design to build from, and the open questions that have
to be answered before it should be.

---

## Why this vendor, for this job only

The call is the hard part and it is not the product. Speech recognition,
speech synthesis, turn-taking, barge-in and sub-second latency are weeks of
work in a domain Reserv has no reason to be good at. ElevenLabs Agents does
that, exposes tools as webhooks, and connects to telephony through Twilio.

**It owns the conversation. It does not own the booking.**

That distinction is not stylistic. The state machine already refuses a
confirmation that is not backed by evidence, and no agent anywhere in this
system holds a `confirm` capability. A voice agent that could mark a table
booked would be the first, and the first is the one that matters.

## What already exists to hold it

Three things were written for this rail before there was one:

**`parsed_confirmation`** — an actor in the state machine, permitted on the
edges into `confirmed` and `alternative_offered`, and nowhere else.

**A confidence threshold.** `CONFIRMATION_CONFIDENCE_THRESHOLD = 0.9`.
Evidence below it cannot confirm, whatever it says. That number is deliberately
high and is discussed under Open questions.

**`AttemptResult`** — already carries `confidence`, `transcriptRef`,
`recordingRef` and `offeredAlternative`. The shape a call produces is the shape
the rail interface expects.

**`voiceChannelConfig`** — already carries `phone_e164`,
`recording_consent_obtained` and `preferred_language`, with a comment noting
that UAE consent is an open legal question.

The integration adds a vendor. It does not add a concept.

---

## Shape

```
scheduler picks the rail
        ↓
VoiceRail.isAvailable()          flag, credentials, consent, hours
        ↓
VoiceRail.attempt()
        ↓
POST ElevenLabs: start outbound call
        ↓  (agent talks to the restaurant)
        ↓
agent calls back into the service as it goes:
    offer_alternative            venue proposed a different time
    out_of_bounds                anything the script does not cover
        ↓
post-call webhook: transcript, outcome, recording
        ↓
map to AttemptResult
        ↓
applyTransition(parsed_confirmation, evidence)
        ↓
STATE MACHINE DECIDES
```

The call is asynchronous and can take minutes. `attempt()` starts it and
returns `no_response`; the webhook completes it. That is the same shape the
WhatsApp rail already uses, and the SLA sweep already escalates an attempt that
never resolves.

---

## The agent configuration

One ElevenLabs agent, versioned in this repository as a JSON document and
applied through their API rather than edited in their dashboard. A prompt
somebody changed in a web console at 11pm is a prompt with no history.

### Prompt

Written against the same rules as every other agent here, plus:

- Identify as an assistant calling **on behalf of a named person**, at the top,
  unprompted. Not as that person.
- State the request once: venue, date, time, party size, and any dietary note.
- Accept a yes. Accept a no. Accept one alternative time.
- **Never** negotiate price, never accept a deposit, never give card details,
  never confirm anything conditional.
- Anything else — a question about the guest, a request to hold a card, an
  offer of a different date, hostility — ends the call politely and raises an
  ops task.

### Dynamic variables

Passed per call, never baked into the prompt:

```
venue_name, guest_name, party_size,
requested_datetime_local, requested_time_spoken,
special_requests, callback_number
```

### Tools the agent may call

Three, all server-side webhooks into the agent service, all authenticated with
the existing `INTERNAL_API_SECRET` scheme.

| Tool                | When                               | What it may do                            |
| ------------------- | ---------------------------------- | ----------------------------------------- |
| `offer_alternative` | venue proposes a different time    | records the offer. Does **not** accept it |
| `out_of_bounds`     | anything the script does not cover | ends the call, opens an ops task          |
| `venue_declined`    | venue says no                      | records the refusal                       |

**There is no `confirm_booking` tool, and there must never be one.** The
outcome of a call is reported by the post-call webhook and judged by the state
machine. A tool the agent can call to declare success is a tool that will
eventually be called on a misheard "yes".

---

## Mapping a call to an outcome

The post-call webhook receives the transcript and the agent's structured
summary. The service maps it, in code, with a zod schema at the boundary:

| Call ended with                         | `AttemptOutcome`      | Confidence                                         |
| --------------------------------------- | --------------------- | -------------------------------------------------- |
| Venue clearly agreed the requested slot | `confirmed`           | from the model's own certainty, capped — see below |
| Venue offered a different time          | `alternative_offered` | as reported                                        |
| Venue said no                           | `declined`            | as reported                                        |
| Nobody answered, voicemail, hung up     | `no_response`         | 0                                                  |
| Anything ambiguous                      | `unclear`             | 0                                                  |
| Vendor or telephony failure             | `error`               | 0                                                  |

`unclear` is the important row. A transcript the model is not sure about must
map to `unclear` and reach a human, not to `confirmed` with a lower number.
The threshold exists to catch mistakes; it should not be doing the work that a
clear rule can do first.

### Confidence is not the model's self-report alone

An LLM asked how confident it is will say 0.95 about most things. The
confidence written into evidence is the **lower** of:

1. what the model reports, and
2. a deterministic check in code: the transcript contains an affirmative from
   the venue side, the spoken time matches the requested time, and the party
   size was restated.

If the check fails, confidence is 0 regardless of what the model said. The
model can lower confidence; it cannot raise it.

---

## Recording, and the thing that blocks this

`recording_consent_obtained` already exists on the channel config and defaults
to false. `isAvailable()` must return false without it — not attempt the call
and skip the recording.

**The UAE position needs a lawyer, not an engineer.** Federal decree-law on
personal data protection and the penal code's provisions on recording
conversations both bear on calling a business and recording it without an
explicit disclosure. The agent's opening line disclosing that it is an
assistant is necessary and probably not sufficient.

Until that answer exists, two options, in order of preference:

1. **Do not record.** Keep the transcript, discard the audio. Most of the
   evidentiary value is in the transcript and the legal exposure is
   considerably lower.
2. **Record with an explicit spoken disclosure and a per-venue consent flag**,
   captured when the venue is onboarded rather than assumed at call time.

`recordingRef` stays optional in `AttemptResult` either way.

---

## Cost, and where it bites

Charged per minute of conversation. A booking call is two to three minutes,
so the marginal cost of a booking is small and predictable — this is the right
economics for supplier calls.

It is the wrong economics for an always-listening user-facing assistant, which
is why this spec covers outbound supplier calls only. Riva stays on text.

Check current rates before committing; they change.

---

## Security

- Credentials in Fly secrets, never in the repository, never client-side.
- The webhook is authenticated and its payload is zod-validated before it
  touches anything, exactly like the WhatsApp and Twilio webhooks already are.
- Webhook replay is rejected through the existing `webhook_events` table.
- **The venue's phone number leaves the system.** It goes to ElevenLabs and to
  Twilio. That is a data-sharing decision about a third party's contact
  details and should be in the venue agreement they sign, not assumed.
- The guest's name goes out too. Nothing else about them should — not their
  email, not their phone, not their history.

---

## What is needed before building

|                                       |          |
| ------------------------------------- | -------- |
| An ElevenLabs account and an agent    | you      |
| A Twilio number that can dial the UAE | you      |
| The legal answer on recording         | a lawyer |
| A venue that has agreed to be called  | you      |
| `FLAG_RAIL_VOICE` and credentials     | me       |

## Open questions

**Is 0.9 the right threshold?** It was chosen before any real transcript
existed. Once there are twenty calls it should be re-derived from them: the
number wanted is the one where no false confirmation gets through, and false
confirmations are the only failure that costs a customer their table.

**What happens on the second attempt?** The rail selector will fall through to
manual if voice fails. Whether a venue that declined by phone should be called
again on a later booking is a product question, not a technical one.

**Arabic.** `preferred_language` exists and is unused. A Dubai pilot will meet
venues where the person answering would rather speak Arabic, and an agent that
opens in English and cannot switch is worse than one that opens in Arabic.
