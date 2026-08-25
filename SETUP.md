# Setup Guide — Dental Clinic AI Receptionist (Mac)

This guide is written for someone who has **not** run a developer project before.
Follow it top to bottom. It takes about **15 minutes**, most of which is waiting
for downloads. You will end with the app running in your web browser.

You will do three things:

1. Install **Docker Desktop** (the engine that runs the app + its database).
2. Add **one AI key** to a settings file.
3. **Start** the app with a single command (or a double-click).

---

## What you received

A folder called `booking-chat-bot`. Everything lives inside it. You do **not**
need to install a database, a programming language, or anything else — Docker
packages all of that for you.

---

## Step 1 — Install Docker Desktop

Docker is a free tool that runs the app and its database in a self-contained box,
so it behaves the same on every computer.

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click **Download for Mac**. Pick the chip your Mac has:
   - **Apple Silicon** (M1/M2/M3/M4) — most Macs from 2020 onward.
   - **Intel** — older Macs.
   - Not sure? Click the Apple menu () → **About This Mac**. If it says
     "Apple M…", choose Apple Silicon.
3. Open the downloaded `.dmg` and drag **Docker** into **Applications**.
4. Open **Docker** from Applications. Accept the terms.
5. Wait until the **whale icon** in the top menu bar stops animating and shows
   "Docker Desktop is running". You can close the Docker window; it keeps
   running in the background.

> You only ever do Step 1 once.

---

## Step 2 — Add your AI key

The receptionist needs an AI provider to talk. You need **one** key. The cheapest
option is **DeepSeek** (a few cents covers heavy testing); **OpenAI** also works.

### Get a key (pick one)

- **DeepSeek:** sign up at https://platform.deepseek.com → **API Keys** →
  **Create new key**. Copy it (starts with `sk-`).
- **OpenAI:** sign up at https://platform.openai.com → **API keys** →
  **Create new secret key**. Copy it (starts with `sk-`).

### Put the key in the settings file

1. In the `booking-chat-bot` folder, find the file **`.env.example`**.
2. Make a copy named **`.env`** (exactly that, with the leading dot).
   - Easiest way: open **Terminal** (Applications → Utilities → Terminal),
     then run these two lines (drag the folder onto the Terminal window after
     typing `cd ` to fill in the path):
     ```bash
     cd /path/to/booking-chat-bot
     cp .env.example .env
     ```
3. Open **`.env`** in TextEdit and set the line that matches your key:
   - If you used DeepSeek:
     ```
     LLM_PROVIDERS=deepseek
     DEEPSEEK_API_KEY=sk-your-key-here
     ```
   - If you used OpenAI:
     ```
     LLM_PROVIDERS=openai
     OPENAI_API_KEY=sk-your-key-here
     ```
4. Save and close.

> **Email is optional.** Without email settings, login codes and booking
> confirmations print to the app's log window instead of being emailed — perfect
> for a demo. To send real emails, see "Optional: real emails" below.

---

## Step 3 — Start everything (one command)

Make sure Docker Desktop is running (Step 1). Then either:

**Option A — double-click.** In Finder, open the `booking-chat-bot` folder and
double-click **`start.command`**. A Terminal window opens and does the rest.

**Option B — Terminal.** In Terminal, from inside the folder:
```bash
npm run start:all
```

Either way, the script will:
- start Docker if it isn't already running,
- build the app (first run only — a few minutes),
- start the database, load the clinic's dentists + services,
- start the website.

When you see logs mentioning **`ready`** and port **3000**, open your browser to:

### 👉 http://localhost:3000

You now have a working AI receptionist. Try: *"What services do you offer?"* or
*"Book a checkup Monday morning."*

---

## Everyday use

| I want to…                     | Do this                                            |
|--------------------------------|----------------------------------------------------|
| Start the app                  | Double-click `start.command` (or `npm run start:all`) |
| Stop the app                   | Click the Terminal window, press **Ctrl + C**      |
| Start fresh (erase all data)   | `npm run reset` then start again                   |

Your bookings are saved between restarts. `npm run reset` wipes the database back
to the clean seeded state (the 3 dentists + 5 services), which is handy before a
demo.

---

## Troubleshooting

**"Docker is not installed"** — Finish Step 1, then try again.

**It stops with "add at least one AI key"** — You started before editing `.env`.
Open `.env`, add your key (Step 2), save, run again.

**"Cannot connect to the Docker daemon"** — Docker Desktop isn't running. Open it
from Applications, wait for the whale icon to settle, try again.

**"port is already allocated" / 3000 in use** — Something else is using port
3000. Quit other dev apps, or restart your Mac, then try again.

**The chat replies "I can't reach our booking assistant right now"** — Your AI
key is missing, wrong, or out of credit. Re-check the key in `.env`.

**First run is slow** — Normal. It downloads and builds once; later runs are
fast.

---

## Optional: real emails (login codes + calendar invites)

By default, codes and invites appear in the app's log window. To email them for
real, use a Gmail account:

1. Turn on 2-Step Verification for the Gmail account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. In `.env`, set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the-16-character-app-password
   MAIL_FROM=Bright Smile Clinic <youraddress@gmail.com>
   ```
4. Restart the app. Login codes and `.ics` calendar invites will now be emailed.

---

## What's running under the hood (for the curious)

One command starts three pieces, in order:

1. **Postgres** — the database (a container).
2. **migrate** — applies the database schema and loads the clinic's data, then
   exits.
3. **app** — the website and booking logic, served at port 3000.

You never manage these individually; the start script and Docker coordinate them.
