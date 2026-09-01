# Setup Guide — AI Booking Assistant, an AI clinic receptionist

Written for someone who has **not** run a developer project before. Follow it top
to bottom. About **15 minutes**, most of it waiting for downloads. You end with
the app running in your browser.

Three things to do:

1. Install **Node.js** and **Docker Desktop**.
2. Add **one AI key** to a settings file.
3. **Start** it.

Steps 1 and 2 are the same on Mac and Windows. Step 3 differs, so it has a
section for each — go to yours and ignore the other.

---

## What you received

A folder called `booking-chat-bot`. Everything lives inside it. You do **not**
need to install a database — Docker provides it.

---

## Step 1 — Install Node.js

Go to **https://nodejs.org** and download the version marked **LTS** (20 or
newer). Run the installer and accept the defaults.

> **npm comes with it.** You do not install npm separately — the Node installer
> includes it. It is the command that runs this project's scripts.

To check it worked, open a terminal (**Terminal** on Mac, **PowerShell** on
Windows) and run:

```bash
node -v
npm -v
```

Two version numbers means you are done. `node -v` must print `v20` or higher.

---

## Step 2 — Install Docker Desktop

Docker runs the app and its database in self-contained boxes, so they behave the
same on every computer.

### Mac

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click **Download for Mac**, and pick your chip:
   - **Apple Silicon** (M1/M2/M3/M4) — most Macs from 2020 on.
   - **Intel** — older Macs.
   - Not sure? Apple menu → **About This Mac**. "Apple M…" means Apple Silicon.
3. Open the `.dmg`, drag **Docker** into **Applications**.
4. Open **Docker** from Applications, accept the terms.
5. Wait until the **whale icon** in the menu bar stops animating.

### Windows

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Click **Download for Windows**.
3. Run the installer. Leave **"Use WSL 2 instead of Hyper-V"** ticked — Docker
   needs WSL 2, and the installer sets it up for you.
4. **Restart** when it asks. This is required, not optional.
5. Open **Docker Desktop** and wait until it says **"Engine running"** at the
   bottom left.

> You only do Steps 1 and 2 once, ever.

---

## Step 3 — Add your AI key

The receptionist needs an AI provider to talk. You need **one** key, from
whichever company you prefer. You pay them directly.

| Provider | Sign up at | Notes |
|---|---|---|
| **DeepSeek** | https://platform.deepseek.com | Cheapest — a few cents covers heavy testing |
| **OpenAI** | https://platform.openai.com/api-keys | |
| **Anthropic (Claude)** | https://platform.claude.com/settings/keys | |
| **Google Gemini** | https://aistudio.google.com/app/apikey | |
| **OpenRouter** | https://openrouter.ai/keys | One key, hundreds of models |

Create a key and copy it (most start with `sk-`).

> Whichever you choose, the assistant books correctly. Availability,
> double-booking, past dates and patient identity are enforced by the app, not by
> the AI — a cheaper model cannot book you into a taken slot. A stronger model
> mainly sounds more natural.

### Make the settings file

In the project folder there is a file called **`.env.example`**. Copy it to
**`.env`** (exactly that, with the leading dot).

**Mac** — open Terminal, then:

```bash
cd /path/to/booking-chat-bot
cp .env.example .env
```

> Tip: type `cd ` (with the space), then drag the folder onto the Terminal
> window to fill in the path.

**Windows** — open PowerShell, then:

```powershell
cd C:\path\to\booking-chat-bot
Copy-Item .env.example .env
```

> Tip: in File Explorer, right-click the folder while holding **Shift** and
> choose **"Open PowerShell window here"** to skip the `cd`.

### Fill it in

Open `.env` in any text editor (TextEdit on Mac, Notepad on Windows). Set
`AI_PROVIDER` to the provider you signed up with, and paste your key on that
provider's line:

```
AI_PROVIDER=anthropic

ANTHROPIC_API_KEY=sk-your-key-here
```

Leave the other providers' key lines empty. Save and close.

You can list two providers, and the second is used automatically if the first is
down or out of credit. Fill in a key for each one you list:

```
AI_PROVIDER=anthropic,deepseek
```

### Windows only — set the clinic's time zone

**Do not skip this on Windows.** On Mac the start script hands the app your
computer's time zone automatically. There is no equivalent step in the Windows
path, and containers run on UTC, so without this the clinic opens at 9:00 **UTC**
rather than 9:00 where you are — and every appointment time you are offered is
wrong for your clock.

In `.env`, set it to the clinic's
[IANA time zone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones):

```
CLINIC_TIMEZONE=Asia/Kathmandu
```

Common ones: `Europe/London`, `Europe/Rome`, `America/New_York`,
`Asia/Kathmandu`, `Asia/Taipei`.

> **Email is optional.** With no email settings, login codes and booking
> confirmations print to the app's log window instead of being emailed — which is
> fine for a demo. See "Optional: real emails" at the end.

---

## Step 4 (Mac) — Start it

Make sure Docker Desktop is running. Then either:

**Option A — double-click.** In Finder, open the project folder and double-click
**`start.command`**. A Terminal window opens and does the rest.

**Option B — Terminal.** From inside the folder:

```bash
npm run start:all
```

Either way this will:

- start Docker if it is not already running,
- pass your computer's time zone to the clinic,
- build the app (first run only — a few minutes),
- start the database and load the dentists and services,
- start the website.

When the logs mention **`ready`** and port **3000**, open:

### 👉 http://localhost:3000

Stop it with **Ctrl + C** in that window.

---

## Step 4 (Windows) — Start it

The `npm run start:all` shortcut is written for Mac — it uses Mac-only commands
to launch Docker and read your time zone. On Windows you do those two things
yourself, and then run Docker directly. It is one extra command, and everything
after it is identical.

1. **Open Docker Desktop** and wait for **"Engine running"**.
2. Check you set `CLINIC_TIMEZONE` in `.env` (previous step).
3. In PowerShell, from inside the project folder:

```powershell
docker compose up --build
```

That does the same work the Mac script does: starts the database, applies the
schema, loads the dentists and services, then starts the website. The first run
downloads and builds, so give it a few minutes.

When the logs mention **`ready`** and port **3000**, open:

### 👉 http://localhost:3000

Stop it with **Ctrl + C** in that window.

> Nothing above needs Git Bash or WSL commands — plain PowerShell is enough.

---

## You now have a working receptionist

Try: *"What services do you offer?"* or *"Book a checkup Monday morning."*

Click the microphone to talk to it instead of typing, if you set a voice key.

---

## Everyday use

| I want to… | Mac | Windows |
|---|---|---|
| Start the app | `npm run start:all` (or double-click `start.command`) | `docker compose up --build` |
| Stop the app | **Ctrl + C** in that window | **Ctrl + C** in that window |
| Erase all data and start fresh | `npm run destroy` then `npm run setup` | `docker compose down -v` then `docker compose up --build` |

Your bookings are saved between restarts. Erasing puts the database back to the
clean seeded state — the 3 dentists and 5 services — which is handy before a
demo.

The database schema and the clinic's data are applied **every time you start**,
on both platforms. That is safe: both steps skip anything already done, so
starting twice changes nothing and your bookings survive.

---

## Troubleshooting

**"docker: command not found" / "not recognized"** — Docker Desktop is not
installed, or you have not restarted since installing it on Windows.

**"Cannot connect to the Docker daemon" / "The system cannot find the file
specified"** — Docker Desktop is not running. Open it, wait for the whale icon
(Mac) or "Engine running" (Windows), try again.

**It stops with "add at least one AI key"** — you started before editing `.env`.
Add your key, save, run again.

**"port is already allocated" / 3000 in use** — something else is using port
3000 or 5432. Quit other development tools, or restart the computer.

**The chat says "I can't reach our booking assistant right now"** — your AI key
is missing, wrong, or out of credit. Check the key in `.env`.

**Appointment times look hours off (Windows)** — `CLINIC_TIMEZONE` is not set, so
the clinic is running on UTC. See the Windows step above.

**First run is slow** — normal. It downloads and builds once; later runs reuse
what it built.

**`npm run start:all` fails on Windows with "bash: not found"** — expected. That
shortcut is Mac-only; use `docker compose up --build`.

---

## Optional: real emails (login codes + calendar invites)

By default, codes and invites appear in the app's log window. To send them for
real, use a Gmail account:

1. Turn on 2-Step Verification for that Gmail account.
2. Create an **App Password** (Google Account → Security → App passwords).
3. In `.env`:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=the-16-character-app-password
   MAIL_FROM=Clinic Name <youraddress@gmail.com>
   ```

   The address in `MAIL_FROM` must be the same one as `SMTP_USER`. Gmail only
   lets you send as the account you signed in with, so a different address is
   quietly replaced with yours rather than rejected. The **name** in front of it
   is yours to choose — that is the part patients see in their inbox.

4. Restart the app. Login codes and `.ics` calendar invites are now emailed.

---

## What is running under the hood

One command starts three pieces, in order:

1. **Postgres** — the database.
2. **migrate** — applies the schema and loads the clinic's data, then exits.
3. **app** — the website and booking logic, on port 3000.

The app is not allowed to start until migrate has finished successfully, so it
can never come up against a database that is half-built.
