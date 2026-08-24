# Putting reservAI online

This walks through it from nothing. Follow it top to bottom — each step needs
the one before it.

Set aside about an hour. Most of it is waiting.

## What you are setting up, and why there are three of them

reservAI is three separate programs that talk to each other. They each need a
different kind of home.

**The database** holds everything — venues, users, bookings. It lives on
**Supabase**. Think of it as the filing cabinet.

**The ops console** is the website you use to add venues and confirm bookings.
It lives on **Vercel**. It is a normal website, so it goes in a normal website
place.

**The agent service** is the part that does the work: it talks to the AI, sends
reminders, and chases venues that have not replied. It lives on **Fly.io**.

That last one needs its own home for a specific reason. It has a job that runs
**every single minute**, checking whether anyone needs a reminder or whether a
venue has gone quiet. Vercel only wakes a website up when somebody visits it —
so on Vercel, that every-minute job would never run at all. Nobody would get a
reminder. Fly keeps it switched on permanently.

You will end up with three accounts. Two are free to start; Vercel is $20/month
because this is a company.

---

## Before you start

You need three things installed. Open your terminal and check each one by
typing the command and pressing enter.

```bash
node --version
```

Should print `v22` or higher. If it says "command not found", install from
[nodejs.org](https://nodejs.org).

```bash
git --version
```

Should print a version number.

```bash
pnpm --version
```

Should print `11` or higher.

If all three printed a version, you are ready.

---

## Step 1 — Put the code on GitHub

Vercel builds your website from GitHub, so the code has to be there first.
Right now it only exists on your laptop.

**1a.** Go to [github.com/new](https://github.com/new).

**1b.** Give it any name — `reserv.ae` is fine. Whatever you choose, use that
same name everywhere this guide says "your repository". Set it to **Private** —
this is your business logic and your venue relationships.

**1c.** Do **not** tick "Add a README", "Add .gitignore", or "Choose a license".
The repository must start empty or the next step will complain.

**1d.** Click **Create repository**.

**1e.** GitHub shows you a page with commands. Ignore them and use these
instead, from your terminal in the project folder.

Replace `YOUR-USERNAME` and `YOUR-REPO` with what you actually used — the
name has to match exactly, capital letters included:

```bash
git remote set-url origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
```

> Getting `error: No such remote 'origin'`? Then nothing is set yet — use
> `git remote add origin ...` instead of `set-url`.

```bash
git branch -M main
```

```bash
git push -u origin main
```

**What should happen:** it counts up some numbers and finishes. Refresh the
GitHub page and your files are there.

> If it asks for a password: GitHub does not accept your account password here.
> It wants a "personal access token". Go to
> [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate
> new token (classic)** → tick **repo** → generate → copy it → paste that as the
> password.

---

## Step 2 — Supabase (the database)

**2a.** Go to [supabase.com](https://supabase.com) and sign up.

**2b.** Click **New project**.

- **Name:** `reservai`
- **Database password:** click Generate, then **save it somewhere safe** — a
  password manager, not a text file. You will rarely need it, but there is no
  way to recover it.
- **Region:** choose **South Asia (Mumbai)**. It is the closest one to Dubai,
  which means the app feels faster.

**2c.** Click **Create new project**, then wait. It takes about two minutes.

**2d.** Now get the connection string for your new database.

In Supabase, click the **Connect** button at the top of the page. Choose the
**URI** tab. You will see something like:

```
postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Copy it, then replace `[YOUR-PASSWORD]` — including the square brackets — with
the database password you saved in step 2b.

> If your password contains any of `@ : / ? # [ ] %` it has to be
> "percent-encoded" or the connection will fail in a confusing way. The simple
> fix is to avoid the problem: in **Project Settings → Database → Reset
> database password**, generate a new one and pick one with only letters and
> numbers.

**2e.** Create all the tables. Paste your connection string between the quotes:

```bash
npx supabase db push --db-url "PASTE-YOUR-CONNECTION-STRING-HERE"
```

**What should happen:** a list of migration files scrolls past, ending without
an error. In Supabase, click **Table Editor** in the left sidebar — you should
see `venues`, `bookings`, `users` and about fifteen others.

**2f. Optional.** Add fifteen made-up demo venues so the console has something
in it. These are invented places, useful for finding your way around. Skip this
if you would rather start with a clean list and add real venues yourself.

```bash
npx supabase db query --db-url "PASTE-YOUR-CONNECTION-STRING-HERE" --file supabase/seed.sql
```

**2g.** Keep that connection string somewhere safe for now. You will not need it
again after this, but it is easier than fetching it twice.

**2h.** Now collect three keys. In Supabase: **Project Settings** (the gear, bottom
left) → **API**.

Copy these into a temporary note — you will paste them into two other websites
shortly:

| What it is called there | Looks like                   | What it is                                                                         |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| **Project URL**         | `https://abcdef.supabase.co` | The address of your database                                                       |
| **anon public**         | a very long string           | Safe to put in an app people download                                              |
| **service_role secret** | another very long string     | **Never share this.** It can read and change anything, ignoring all security rules |

> **About that third key.** Treat it like the master key to your office. It goes
> into exactly one place (step 4) and nowhere else. Never in the website,
> never in an email, never in a screenshot.

---

## Step 3 — Vercel (the ops console)

**3a.** Go to [vercel.com](https://vercel.com), sign in **with GitHub**.

**3b.** Click **Add New** → **Project**.

**3c.** Find your repository in the list and click **Import**.

**3d.** This next bit matters. Under **Root Directory**, click **Edit** and
choose the `apps/ops` folder.

Your repository holds three programs. This tells Vercel to build only the
website one. Without it, the build fails with a confusing error.

**3e.** Expand **Environment Variables** and add three. Name on the left, value
on the right:

| Name                            | Value                            |
| ------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Your Project URL from 2h         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **anon public** key from 2h  |
| `AGENT_SERVICE_URL`             | `https://reservai-agent.fly.dev` |

That third one does not exist yet — you create it in step 4. Type it in anyway;
it will be correct by the time anything uses it.

Notice the `service_role` key is **not** here. The console does not get one. It
can only see what the person signed into it is allowed to see.

**3f.** Click **Deploy** and wait two or three minutes.

**What should happen:** confetti, and a link to your site. Click it. You should
see a sign-in page asking for an email address.

---

## Step 4 — Fly.io (the agent service)

This is the part that runs every minute.

**4a.** Install the Fly command-line tool. On Windows, open **PowerShell** and
paste:

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Then **close and reopen your terminal** so it picks up the new command.

**4b.** Create an account:

```bash
fly auth signup
```

It asks for a card. There is a free allowance; one small machine like this
costs a few dollars a month.

**4c.** From your project folder:

```bash
fly launch --no-deploy --copy-config --name reservai-agent
```

Answer **no** if it offers to tweak settings. The configuration is already
written and committed.

**4d.** Now the secrets. This is the one place the `service_role` key goes.

Type this as **one single line**, replacing the four bracketed parts. It is
long — that is expected.

```bash
fly secrets set SUPABASE_URL="[YOUR PROJECT URL]" SUPABASE_ANON_KEY="[YOUR ANON KEY]" SUPABASE_SERVICE_ROLE_KEY="[YOUR SERVICE ROLE KEY]" ANTHROPIC_API_KEY="[YOUR ANTHROPIC KEY]" INTERNAL_API_SECRET="pick-any-long-random-string-here" AI_MODEL_FAST="claude-haiku-4-5" AI_MODEL_STRONG="claude-opus-5" REDIS_URL="redis://127.0.0.1:6379"
```

Notes on two of those:

- **`ANTHROPIC_API_KEY`** — from
  [console.anthropic.com](https://console.anthropic.com) → API Keys. This is
  what makes the AI work. Without it the app runs but cannot understand
  requests or suggest anywhere.
- **`INTERNAL_API_SECRET`** — invent one. Mash the keyboard for 30 characters.
  It stops strangers triggering internal jobs.

`REDIS_URL` is not used yet. It is there because the app checks for it on
startup; the value is ignored.

**4e.** Now the switches that say which features are on:

```bash
fly secrets set FLAG_RAIL_MANUAL=true FLAG_RAIL_WHATSAPP=false FLAG_RAIL_API=false FLAG_RAIL_VOICE=false FLAG_PROACTIVE_SUGGESTIONS=false FLAG_STRIPE_SUBSCRIPTIONS=false
```

Only the manual one is on. That means you confirm bookings by hand, which is
exactly how the pilot is meant to start.

**4f.** Send it up:

```bash
fly deploy
```

**What should happen:** several minutes of building, then a success message.
Check it:

```bash
curl https://reservai-agent.fly.dev/capabilities
```

You should get back a line of text mentioning `"concierge_chat":true`. If you
see that, it is running.

---

## Step 5 — Give yourself access

The console will not let you in yet. Nobody is an administrator.

**5a.** Open your Vercel site and sign in with your email. It sends you a
six-digit code. Enter it.

**5b.** You will be told you do not have access. That is correct — signing in
created your account, which is what step 5c needs.

**5c.** In Supabase, click **SQL Editor** in the left sidebar, then **New
query**. Paste this, with your own email:

```sql
select public.grant_role_by_email('you@yourdomain.com', 'admin');
```

Click **Run**.

**5d.** Go back to your site and refresh. You are in.

---

## Step 6 — Check it works

Click around the console:

- **Venues** — the demo venues, if you added them in 2g
- **Bookings** — empty, which is right
- **Metrics** — all zeros, which is also right
- **Approvals** — should say the WhatsApp rail is not live

That last one is the app being honest rather than broken. WhatsApp is switched
off until you have an account with a provider, so it says so instead of
pretending.

---

## What is still switched off, and why

**WhatsApp messaging to venues.** Needs a business account with a provider
(Twilio or 360dialog) and a message template approved by WhatsApp. **Approval
takes weeks**, so it is worth applying early even though the feature is not
needed until later.

**AI phone calls to venues.** Needs a legal answer first: UAE rules on
recording phone calls. The app currently refuses to switch this on until
someone has confirmed a venue agreed to be recorded.

**Subscriptions.** Free during the pilot. The app asks users whether they
_would_ pay AED 99/month, which is the number you need. Nobody is charged.

**The phone app.** Works, but needs an Apple Developer account ($99/year) to
get onto anyone's phone. Apple's approval for a company takes days to weeks —
also worth starting early.

---

## If something goes wrong

**Vercel build fails.** Almost always the Root Directory in step 3d. It must be
`apps/ops`.

**Console says "no access" after step 5.** Check the email in the SQL matches
the one you signed in with, exactly.

**`fly deploy` fails.** Run `fly logs` to see why. Usually a missing secret from
4d — check for a typo in one of the names.

**`git push` says "Repository not found".** The name in the remote does not
match the repository on GitHub — check for capital letters and any `.` in the
name. Confirm what git is aiming at with `git remote -v`, then correct it with
`git remote set-url origin https://github.com/YOUR-USERNAME/YOUR-REPO.git`.

A private repository also reports "not found" when git cannot authenticate, so
if the name is definitely right, it is the token — see the note in step 1e.

**A Supabase command says "Unexpected positional argument".** The command has
one word too many. Copy it again from this guide — it is easy to end up with a
stray word when pasting across two lines.

**Anything else.** Tell me the command you typed and what it said, and I will
sort it.
