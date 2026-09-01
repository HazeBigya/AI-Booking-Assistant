# AI Booking Assistant — internal documentation

# 1. Architecture

## 1.1 Core Idea

**The AI model never decides anything that must be correct.**

The model has two jobs. It understands what the patient wants, and it picks which
function to call. Then it writes the answer as a sentence.

Normal code and the database decide everything else: free times, prices, which
dentist can do which treatment, double bookings, past dates, and who the patient
is.

This is why the choice of AI model is a cost question and not a safety question.
A cheap model writes worse sentences. It cannot make a wrong booking.

The outside services sit at the edge, and the booking rules in the middle touch
none of them. This is called ports and adapters. Changing supplier is a settings
change, not a code change — section 1.4 lists which settings.

## 1.2 Tech Stack

| Part | Choice |
|---|---|
| Language | TypeScript 5 |
| Runtime | Node.js 20 or newer |
| Framework | Next.js 14 |
| Database | PostgreSQL 16 |
| Database code | Drizzle, with drizzle-kit for migrations |
| Validation | Zod |
| Email | Nodemailer for SMTP, Resend as the alternative |
| AI | one client for every OpenAI-compatible vendor, plus native clients for Google and AWS |
| Tests | Vitest, 207 tests |
| Packaging | Docker and Docker Compose |

## 1.3 The App Structure

The app has three parts:

| Part | Job |
|---|---|
| The screen | What the patient sees. Runs in their browser |
| The connector | Turns a web address into a function call |
| The backend | The rules, the AI, the database |

A message travels like this:

```
the patient types and sends
      │
      ▼
the screen  →  one file that sends the request  →  POST /api/chat
                                                        │
                                                        ▼
                                    the connector: who is logged in? what did they say?
                                                        │
                                                        ▼
                                    the backend: check, ask the AI, run the tools
                                                        │
                                                        ▼
                                                    PostgreSQL
```

Three things are worth knowing about this shape.

**The connector does no thinking.** It reads who is logged in, hands the message
to the backend, and sends the answer back. Every rule lives behind it. This is
why there are eight small connector files instead of one large one.

**One file talks to the server.** The screen never contacts the backend directly.
Everything goes through a single file, so changing how requests are sent means
changing one place.

**The website and the backend are one program.** In Next.js a folder named
`api/chat` automatically becomes the web address `/api/chat`. So there is no
separate list of addresses to keep in step with the code — the folders are the
list, and they cannot fall out of date. This is why there is no second server
program to install, start and monitor.

Two useful consequences.

The first screen is built on the server and arrives as a finished page. After
that the conversation runs in the browser and only sends short messages back and
forth. The page never reloads while the patient is talking.

The keys stay on the server. The AI key, the database password and the mail
password are only ever read by the backend, so they are never sent to the
patient's browser. I checked the built browser files to confirm it: none of them
contain a key, a tool name, or any database code.

## 1.4 Agnostic AI design

The product is not tied to any AI company.

**Any provider works.** The model sits behind one interface. Most AI companies
copy the OpenAI message format, so a single adapter already covers OpenAI,
Anthropic, DeepSeek, Gemini and OpenRouter. Each is a row in a table holding its
address, its key name and a default model. Only Amazon Bedrock needs its own
adapter, because it has no compatible format.

Changing supplier is a settings change:

| To do this | Change this |
|---|---|
| Move the brain from OpenAI to Anthropic | `AI_PROVIDER=anthropic`, and add `ANTHROPIC_API_KEY` |
| Move email from Gmail to Resend | Remove `SMTP_HOST`, add `RESEND_API_KEY` |
| Use a different voice company | `VOICE_TTS_PROVIDER`, and its key |

No file is edited and the booking rules never move. I only write code for a
supplier nobody has connected yet.

**Each role can use a different company.** The product uses AI for three jobs,
and each one chooses separately, because the cheapest good brain and the best
voice rarely come from the same company.

| Role | Job | Setting |
|---|---|---|
| Brain | Picks the tool, writes the reply | `AI_PROVIDER` |
| Ears | Speech to text | `VOICE_STT_PROVIDER` |
| Mouth | Text to speech | `VOICE_TTS_PROVIDER` |

So a clinic can run a cheap model for the conversation and pay for quality only
where the patient actually hears it.

**A backup chain.** `AI_PROVIDER` also takes a list, tried in order:

```
AI_PROVIDER=openai,anthropic
```

OpenAI answers everything. If OpenAI fails or is too slow, Anthropic answers the
same message. The patient waits a little longer and sees no error. A provider
with no key is skipped at startup with a warning rather than crashing the app.

## 1.5 The eight tools

These eight functions are the only actions in the whole system. The model cannot
touch the database, the internet, or the files. It can only ask for one of these
to run, and everything it says to a patient comes from one of them.

| Tool | What it takes | What it does |
|---|---|---|
| `list_services` | nothing | Returns every treatment, with price and duration |
| `get_professionals_for_service` | service name | Returns the dentists who can do that treatment |
| `check_availability` | service, dentist, day | Returns that dentist's free times. Times already gone, and times the patient is busy, are removed first |
| `request_login_code` | email | Sends a 6-digit code to that address |
| `verify_login_code` | email, code | Checks the code and logs the patient in |
| `get_my_appointments` | nothing | Returns the logged-in patient's own appointments |
| `create_booking` | service, dentist, start time, name | Books the time and sends both calendar invitations |
| `cancel_booking` | booking id | Cancels one of the patient's own bookings |

When `check_availability` finds no free times it also says **why**: the clinic is
closed, it is too late today, the patient already has something booked, or the
dentist is fully booked. Without that, the assistant would say "fully booked" for
all four, and three of those would be a lie.

`get_my_appointments` takes no email on purpose. The email comes from the login
cookie, so the model has no way to name another patient.

Anything not on this list cannot happen, however the patient phrases it. Every
value the model sends is checked before the function runs, because the model's
output is untrusted input.

## 1.6 Who the patient is

There is no login screen. The product should feel like talking to a
receptionist, and nobody shows a password at the desk before asking a question.
Anyone can open the page and start talking: what a treatment involves, what it
costs, who does it, when there is a gap.

The patient only has to prove who they are at the moment it matters, which is
booking or looking at their own appointments.

**Why email, and not a password.** A booking ends with a calendar invitation.
It is sent as a `.ics` file, so it goes straight into Apple Calendar, Google
Calendar or Outlook. That only works if the address is real. So instead of a
password, the patient gets a 6-digit code by email and types it back. One check,
and it proves the address works.

A password would prove something less useful. It proves the patient remembers a
secret, not that the invitation will arrive.

**They do this once.** After a correct code the browser holds a login token for
7 days. A patient who books again the same week is asked nothing. After a week
they verify their email again.

The code lasts 10 minutes and works once. I never store the code itself, only a
scrambled version, so the table it lives in is useless to anyone who reads it.

The token is also checked against the patient list on every request, not just
for a valid signature. A token stays valid for 7 days on its own, so it can
outlive the patient it names — after the database is wiped, or restored from an
older backup. Without that check the app would show somebody as logged in as a
patient the clinic no longer has.

**Letting anyone chat has a cost.** If nobody logs in, anyone can spend the
clinic's AI budget. A per-minute limit is not enough on its own: 20 a minute,
run all day by a script, is about 28,800 messages. So there are two daily caps:

| Who | Cap | Counted by |
|---|---|---|
| Someone who has not verified | 30 messages a day | The chat cookie |
| A verified patient | 100 messages a day | Their email, across all their devices |

The numbers come from how the product is actually used. A booking takes 6 to 8
messages, and browsing before deciding takes 10 to 20. Both caps sit above that,
because a limit that interrupts a real booking is worse than no limit at all.

The counts are read from the messages already stored, not from a counter kept in
memory. A counter in memory resets every time the app restarts, which would give
an attacker a fresh budget on every restart.

When a patient reaches a cap they are not shown an error or a number. They are
asked to call the clinic.

**What these caps do not stop.** Someone who has not verified is identified by a
cookie, and they can clear it and start again with a fresh 30. So the caps stop
mistakes and casual abuse, not a determined script. Stopping that needs a limit
on the clinic's total for the day, which nobody can reset by clearing anything.
That is in section 6.

## 1.7 Conversation history

Every message is saved. Only the **last 15** are sent to the AI model.

The window is small on purpose. In a normal chatbot the conversation is the
product. Here the booking is the product, and the booking lives in the database.

If a patient asks "when is my appointment?" after 30 messages, the answer comes
from a tool reading the database, not from the model remembering. The tools are
the memory. The conversation only carries recent wording.

A bigger window would cost more tokens on every single message and give a weak
model more text to get lost in.

## 1.8 Why PostgreSQL and Drizzle

The data is relational. A booking belongs to a patient, points at a dentist, and
is for a treatment; a dentist can do some treatments and not others. That is
rows, columns and links between them — which is exactly what a relational
database is built for.

**Why not MongoDB.** Mongo is good when the shape of the data varies and the
links are few. Here the shape never varies and the links are the whole product.
Storing a booking as a document means the rule "this dentist can do this
treatment" lives in my code instead of in the database, and any bug in my code
becomes bad data.

**Why not MySQL.** MySQL is relational too and would work. Postgres wins on one
feature:

```sql
EXCLUDE USING gist (professional_id WITH =, tstzrange(start_time, end_time) WITH &&)
  WHERE (status = 'booked')
```

This makes it *impossible* to store two overlapping bookings for the same
dentist. Not "the code checks for it" — the database physically refuses. That
matters when two patients click at the same second, where checking first is not
enough. MySQL has no equivalent. Double booking is the one mistake a booking
product cannot make, so that decided it.

**Drizzle** sits between my code and the database so I write queries in
TypeScript instead of assembling SQL strings. It is thin: the query I write looks
like the SQL it sends, so nothing surprising happens in between. The types come
from the table definitions, so renaming a column and forgetting to update a query
breaks the build instead of a patient's booking.

**A migration file** is a small, numbered file that records one change to the
database shape — "add this column", "create this table". They are kept in the
project and applied in order, so an empty database and a year-old one both end up
with exactly the same structure. Without them, updating a live database means
somebody typing commands by hand and hoping.

## 1.9 Email

Three ways to send email behind one interface, chosen automatically: SMTP if it
is configured, otherwise Resend, otherwise the console. So the app runs with no
email setup at all.

The demo uses **Gmail SMTP**, chosen for its free tier. The professional services
are more restrictive when you are not paying:

| Service | The limit on the free plan |
|---|---|
| Resend | Only delivers to your own verified address until you verify a domain |
| Mailgun | Test mode only delivers to a few pre-approved addresses |
| Gmail SMTP | Free and delivers to anyone, but it is a personal mailbox with daily limits |

Neither free plan from a proper email service can send a booking confirmation to
a real patient, which is exactly what needed demonstrating. Gmail could.

**For production I would use Mailgun**, or Resend with a verified domain. Gmail
is a personal mailbox: it has daily send limits and its deliverability is not
designed for a business sending appointment confirmations. Moving is two
settings and no code.

---

# 2. How it decides what to say

The model receives the conversation and a description of the eight functions. It
does **not** receive the clinic's data. To learn anything, it has to ask.

1. Send the conversation and the function descriptions to the model.
2. If the model asks for functions, run all of them and send back the results.
3. Repeat until the model writes a normal sentence, or until 8 rounds are used.

The answer is built in two steps. **The facts come from the code. The model only
writes the sentence.**

If a patient asks "is Dr Chen free on Thursday?", the model cannot guess or
remember. It calls `check_availability`, gets a list of times, and reads it back.

The 8-round limit matters: without it, a confused model could call functions over
and over at the clinic's expense.

## How it stays correct

Facts are read at the moment they are spoken. There is no saved copy of the
schedule that can go out of date.

Before any message is sent, I compare the sentence with what the tools actually
returned. If the model confirms a booking that never happened, that message never
reaches the patient.

Some rules live in the code instead of the instructions. These are the ones the
model kept breaking:

| The model kept doing this | Now stopped by |
|---|---|
| Offering times when the clinic is closed | A check in the booking rules |
| Saying a booking was made when it was not | The reply is compared with the tool results |
| Writing emojis and code | The output check removes them |
| Inventing "that is also 9:00 AM in your time zone" | Removed when the patient is in the clinic's time zone |

The last line taught me the most. I wrote that rule in the instructions three
times and the model broke it three times. Each rule I wrote described the exact
wording I had just seen, and the model then used different wording.

**A rule the model keeps breaking belongs in the code, not in longer
instructions.**

---

# 3. What happens when something fails

| Problem | What the system does |
|---|---|
| One AI provider is down | The next provider in the list answers. A provider with no key is skipped at startup, with a warning |
| All AI providers are down | The patient reads "I can't reach the booking assistant". Never an error page |
| A tool gets bad values | Tools never crash. They return an error the model can read and correct. A crash would end the conversation |
| The model repeats itself forever | The loop stops after 8 rounds and returns a fixed message |
| A supplier changes the rules | One model started refusing every message because it does not accept functions while "reasoning" is on. The adapter now retries with reasoning off, but only when the API says that is the problem. I read the API's error instead of keeping a list of model names, because such a list is out of date the day I write it |
| The voice key is missing | The microphone turns off and the message names the setting to add. It does not fall back to the robotic voice built into the browser, because that would deliver the rejected thing while looking like it works |

---

# 4. Security

Five layers, and only the first is made of words.

**1. The instructions** tell the model what it is and what it must not do. This is
the weakest layer and I treat it that way.

**2. The tools are the only actions.** See section 1.5. This is why "ignore your
instructions" does not work — there is nothing else for the model to become.

**3. Identity comes from the login cookie, never from the model.** The request
the browser sends contains the message and nothing about who is sending it. The
email is read from the signed cookie on the server. There is no field for an
attacker to change, so nobody can be talked into booking under another person's
address.

**4. The database is the final authority.** See section 1.8.

**5. Fixed rules in the code.** See section 2.

### Before it runs on a public server

Five things are safe on a laptop and unsafe on the internet:

- The setup file opens the database port to the outside. Remove it.
- The database password is written in the file.
- The login secret falls back to a known development value. On a server it
  should refuse to start instead.
- There is no HTTPS. A reverse proxy with a free certificate goes in front.
- Voice does not work at all without HTTPS, because browsers block the
  microphone on insecure pages. So the previous point is not only about
  security — without it a feature is missing.

### What I do not defend against

Picking the right dentist from an unclear sentence depends on the model, and a
weak model may pick the wrong one. It cannot pick a dentist who is unqualified or
unavailable, because those are refused. And the confirmation says which dentist
was booked, so the mistake is visible rather than hidden.

---

# 5. Cost

## To build

| | |
|---|---|
| Time | 8 working days (22–31 August 2026) |
| Commits | 70 |
| Application code | about 6,100 lines |
| Test code | about 2,200 lines, 207 tests |

A quarter of the code is tests. They cover the booking rules, the output guards,
every provider failure path, the usage caps, and the voice layer. None of them need a database,
an API key or a network connection, so the whole suite finishes in 1.3 seconds —
which is what made it practical to keep changing the booking rules late in the
project.

## To run — 50 patients per day

*Server: AWS EC2, us-east-1, on-demand prices, checked September 2026.*

| | $ per month |
|---|---|
| `t4g.medium` — 2 CPU, 4 GB memory | 24.53 |
| 30 GB disk | 2.40 |
| Email | 0–20 |
| **Fixed total** | **about 27–47** |

For the AI cost I am using measured numbers. The system recorded token usage for
every message during the whole project. The middle value is 8,900 tokens per
message, and about 94% of that is input, because the instructions, the function
descriptions and the last 15 messages are sent every time while the reply is only
two sentences.

```
50 conversations per day × 30 days  =  1,500 per month
1,500 × 6 messages × 8,900 tokens   ≈  80 million tokens per month
```

| Model for the brain | AI per month | Total with server |
|---|---|---|
| A cheaper model, like DeepSeek | about $14 | **about $45** |
| A middle model | about $300 | about $330 |
| A top model | about $1,490 | about $1,520 |

The server cost is small next to the AI cost. On anything above the cheapest
model the server is under 10% of the bill, so the real cost decision is one line
in the settings file — and correctness does not change between those rows,
because the model is not the thing that decides.

Voice, if it is on, is charged per minute of audio and becomes the bigger cost if
patients use it a lot. Token prices change often, so what matters is not the
exact numbers but that one model can cost 100 times more than another for the
same product.

## To maintain

The suppliers change more often than the code does. Three real examples: one
model refused to use functions while "reasoning" was on, one voice company
refuses its best-known voice on free accounts, and model names change between
releases. I handled all three the same way — read the error the API sends,
instead of keeping my own list of model names.

Normal maintenance is updating libraries and checking prices. Nothing runs in the
background that needs watching, and the database is the only thing holding data,
so backups are the only real operations work.

---

# 6. Risks and missing features

These were decisions, not mistakes.

| Not built | Reason |
|---|---|
| **Prompt caching** | The most valuable item here. About 94% of the cost is text that is identical every time, and most AI companies will store that text and charge about 10% for it. On a middle model that is about $140 a month instead of about $300 |
| **A daily cap for the whole clinic** | The two caps in section 1.6 are per caller, and someone who has not verified can clear their cookie to reset their own. A cap on the clinic's total for the day is the one nobody can reset, and it is what would turn an unbounded bill into a bounded outage. Left out to keep the rule simple |
| **Shared burst limiting** | The daily caps are counted from the database, so they survive a restart and work across several servers. The 20-a-minute burst limit is still held in memory and keyed on a header the caller can set, so it is per-server and can be faked. Behind a reverse proxy that is fine. On its own it is not. Redis is the path |
| **Changing an appointment** | Today the patient cancels and books again in one conversation. A real change would move the booking and keep its calendar id, so the existing invitation updates instead of being replaced |
| **Interrupting the voice** | Speaking over the assistant needs two-way streaming through the whole loop. That is a different design, not a setting. What I built instead: the turn ends automatically after 1.6 seconds of silence |
| **Calendar accounts** | The calendar invitation works with no accounts connected. Automatic acceptance would need every dentist to connect their calendar, and the clinic would have to keep those credentials |
| **A screen for clinic data** | Dentists, treatments and prices come from a file in the code. A clinic cannot change them without a developer |
| **Model quality testing** | Nothing measures how often a model picks the right dentist from an unclear sentence. That is the one quality that really changes between models, so it is worth measuring before switching model in production |
