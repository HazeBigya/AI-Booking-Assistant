# AI Booking Assistant Guide for Your Clinic

This guide has two parts. **Part 1** explains what the assistant does. **Part 2**
walks you through setting it up and running it, step by step. You do not need any
technical background, and most of the setup is just waiting for a few free programs
to download.

---

# Part 1. About the app

## What it is

The AI Booking Assistant is a receptionist that works by chat. A patient opens a
web page, types or speaks, and the assistant answers and books their appointment.
It runs on your own computer or server, so your patient list stays with you.

It behaves like a good front-desk person. It understands a patient even when they
make a typo or use different words, it only offers times you are actually open,
and it never books two people into the same slot.

The assistant is set up as a dental clinic because that is the example it was
built for, but nothing inside it is dental. The same product would work for a
physiotherapy or eye clinic by changing the list of treatments and staff.

## How it works

A patient books the way they would talk to your front desk, in a few short
messages. Here is a normal booking from start to finish:

1. The patient opens your web page and says what they need — for example, "I'd
   like a checkup next week."
2. The assistant answers from your real information. It explains the treatment,
   the price, and which dentists do it, and it offers only times you are actually
   open.
3. When the patient picks a time, the assistant asks for their email and sends a
   6-digit code to it. They type the code back. This one step proves the email is
   real, so the confirmation and the calendar invite have somewhere to go.
4. The assistant books the time and emails a confirmation with a calendar invite
   attached, so the appointment drops straight into the patient's calendar.

Two things happen quietly that matter for a clinic. Before it promises any time,
the assistant checks your live schedule, so it never offers a slot that is already
taken or has already passed. And the booking is written so it cannot double-book:
if two patients reach for the same slot in the same second, only one can win, and
the other is offered a different time.

The patient can also **speak instead of type**. With voice turned on they talk and
the assistant talks back, and the booking works exactly the same way underneath —
the same schedule, the same email check, the same invite.

Everything runs on your own computer or server, so your patient list and your
bookings stay with you. The only thing that leaves is the conversation itself,
sent to the AI company that writes the replies — never your database.

## What a patient can do

- Ask what a treatment is, what it costs, and who does it.
- Check which times are free.
- Book an appointment. To book, the patient confirms their email with a short
  code, so you always have a real address for the calendar invite.
- See or cancel their own appointments.
- Do all of this by typing, or by speaking if voice is turned on.

When a patient books, the assistant sends a calendar invite to their email, so
the appointment drops straight into their calendar.

## What it will not do

This is on purpose, and it is what keeps the assistant safe to put in front of
patients.

- It never makes up a time or a price. Every answer comes from your real schedule
  and your real price list.
- It cannot book two patients into the same slot, even if they both try at the
  same second.
- It cannot book an appointment under someone else's name. A patient can only see
  and change their own bookings.
- It does not give medical advice.
- It cannot yet move an appointment. To change one, the patient cancels it and
  books a new time.

## Your clinic's details

Right now, the list of dentists, the treatments, their prices, and your opening
hours live inside the app's files. They are set to an example dental clinic.
Changing them to your real clinic needs a developer to edit those files once.

## What is not included yet

These were left out on purpose, to keep the first version simple and correct.

- **A settings screen for your clinic.** Today, staff, treatments, prices and
  hours are changed by a developer in the files, not by you on a screen.
- **Moving an appointment.** Today a patient cancels and books again instead.
- **Calendar invites to the dentists.** The dentists are dummy data for the demo,
  so only the patient gets the invite. Once you add real dentists with their real
  emails, it is plug and play: the same invite goes to both the patient and the
  dentist, no code change needed.

---

# Part 2. How to run it

## Before you start

You set this up once. Here is what you need, all of it outside the app itself.

**A computer to run it on.** A normal Mac, Windows, or Linux computer is fine to
try it. For real daily use you would leave it running on an always-on computer or
a small rented server.

**Three free programs: Node.js, Docker, and Git.** You install these once. Node.js
runs the app, Docker quietly provides the database so you never manage one
yourself, and Git downloads the code. How you install Docker is the only real
difference between Mac, Windows, and Linux, and that is covered in the steps below.

**The code.** You do not need a folder in advance. In Step 2 you use Git to
download the project from its online home into a folder called `AI-Booking-Assistant`.

**One AI key.** The assistant needs an account with an AI company to do its
thinking. You pick one company, create a key, and paste it into a settings file.
You pay that company directly, and for a small clinic it is a few dollars a month
or less.

**I recommend OpenAI.** One OpenAI key covers everything: the chat, and both
halves of voice (listening and speaking). Other companies only do the chat, so
you would need a second account for voice. Getting the OpenAI key is Step 3.

Other companies work too, if you prefer one. You would use its key for the chat,
and OpenAI (or another voice company) for voice:

| Company | Sign up at | Note |
|---|---|---|
| OpenAI | https://platform.openai.com/api-keys | Recommended. One key does chat and voice |
| Anthropic | https://platform.claude.com/settings/keys | Chat only |
| Google Gemini | https://aistudio.google.com/app/apikey | Chat only |

Whichever you pick, the assistant books correctly. The choice of company only
changes how natural the wording sounds and how much it costs, never whether a
booking is right.

**Your clinic's time zone**, so the assistant offers times on your clock. You set
this in the settings file (automatic on Mac).

**A Gmail account.** The assistant emails the login code to the patient and sends
the calendar invite, so it needs an email account to send from. The simplest is a
Gmail account with an "app password", which you set up in Step 5. This is a real
step, not optional: the login code arrives by email, so without it a patient
cannot finish booking.

## Step 1. Install Node.js, Docker, and Git

**Node.js** is the same on all three systems: go to https://nodejs.org, download
the version marked LTS (20 or newer), and run the installer with the default
options.

**Git** is also the same on all three: go to https://git-scm.com/downloads,
download it for your system, and run the installer with the default options. On
Mac, Git often comes already installed. To check, open the Terminal and type
`git --version`. If it prints a number, you already have it.

**Docker** depends on your system.

**On Mac and Windows**, install **Docker Desktop** from
https://www.docker.com/products/docker-desktop. After it installs, open it once so
it is running in the background.

**On Linux**, you do not need Docker Desktop. Install the Docker engine from the
command line. On Ubuntu or Linux Mint:

```
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Then log out and back in once, so your user is allowed to run Docker without
`sudo`. (Other Linux systems use a similar command with their own package tool.)

## Step 2. Download the code

Open a terminal (Terminal on Mac or Linux, PowerShell on Windows). Go to the
folder where you want the project to live, for example your home folder, then
download it with Git:

```
git clone https://github.com/HazeBigya/AI-Booking-Assistant.git
cd AI-Booking-Assistant
```

The first command copies the whole project into a new folder called
`AI-Booking-Assistant`. The second command moves you into that folder. Every
command after this runs from inside it, so keep this terminal window open.

## Step 3. Add your AI key (same on all systems)

**First, get an OpenAI key.**

1. Go to https://platform.openai.com and sign in.
2. Open **API keys** and choose **Create new secret key**. Copy it now, as it is
   shown only once. It starts with `sk-`.
3. Open **Billing** and add a little credit. For a demo, **$5** is plenty and
   covers heavy testing.

**Then put it in the settings file.**

Inside the project folder is a file called `.env.example`. Make a copy of it named
`.env` (with the dot at the front):

- **Mac or Linux**, in a terminal: `cp .env.example .env`
- **Windows**, in PowerShell: `Copy-Item .env.example .env`

Open your new `.env` file in any text editor. It already has `AI_PROVIDER=openai`
set for you. Paste your key on the OpenAI line:

```
AI_PROVIDER=openai

OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_MODEL` is which OpenAI model to use as the brain. Leave the other
companies' key lines empty, then save the file.

**Optional: a backup company.** You can list two companies, and the assistant uses
the second only if the first is down or out of credit. Put both on the
`AI_PROVIDER` line, in order, and fill in a key for each:

```
AI_PROVIDER=openai,anthropic

OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

**One more line: the security key.** The `.env` file has a line called
`AUTH_SECRET`. The app uses it to sign the login token a patient gets after
entering their code, so nobody can fake that token. For a demo, the example value
already works and you can leave it. For real use, replace it with a long random
string of your own and keep it private:

```
AUTH_SECRET=a-long-random-string-you-keep-secret
```

## Step 4. Check the time zone

The example file already has `CLINIC_TIMEZONE=Asia/Taipei` set for the demo. This
is the clock the clinic's opening hours run on. If your clinic is somewhere else,
change it in `.env` to your area:

```
CLINIC_TIMEZONE=Asia/Taipei
```

## Step 5. Set up email

The assistant sends the patient a login code and, after a booking, a calendar
invite. To send these for real, add a Gmail account with an "app password", which
is a one-off password Google makes for programs like this:

1. Turn on 2-step verification on your Google account.
2. Create an app password at https://myaccount.google.com/apppasswords.
3. The `.env` file already has these lines with example values. Replace
   `you@gmail.com` and `your-app-password` with your own Gmail address and the app
   password you just made:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=Bright Smile Clinic <you@gmail.com>
```

Save the file. Leaving the example values in place will stop login codes from
sending, so put your real ones here. For real production use I would use a proper
mail service like AWS SES, Mailgun, or Resend. For the demo I stick to a free Gmail
account, which meets our needs and delivers to any patient. The developer can
switch to a paid service later by changing these few settings.

## Step 6. Start it

Make sure Docker is running first. Run these from inside the `AI-Booking-Assistant`
folder from Step 2.

**On Mac**, run this in the Terminal:

```
npm run start:all
```

**On Linux**, open a terminal in the project folder and run:

```
docker compose up --build
```

**On Windows**, open PowerShell in the project folder and run the same command:

```
docker compose up --build
```

The first start takes a few minutes while it downloads and builds. Later starts
are quick. **Wait until it stops and shows a line with `http://localhost:3000`.**
That line means it is ready. Until you see it, the app is still starting and the
page will not open yet.

## Step 7. Open it

Once you see that `http://localhost:3000` line, go to `http://localhost:3000` in
your web browser. You now have a working receptionist. Try booking an appointment
to see it work.

## Everyday use

**Start it.** The same command from Step 6, run from inside the project folder.
Leave that window open while the assistant is in use.

**Stop it.** Press `Ctrl + C` (or `Cmd + C`) in the window. Your data stays in the
database, so next time you start, everything is still there.

**Reset the app.** To wipe all data and start clean, run `npm run destroy`. This
removes the data on purpose, so only use it when you want to reset.

## If something goes wrong

**The page will not open.** Make sure Docker is running, and that the start window
is still open with no error in it. Give the first start a couple of minutes to
finish building.

**"Port already in use."** Another program is using the same door as the app.
Close other apps that might run a web server, or restart the computer, then start
again.

**The times look wrong (Windows or Linux).** You likely skipped the time zone step.
Set `CLINIC_TIMEZONE` in the `.env` file to your area and start again.

**Docker says "permission denied" (Linux).** You have not logged out and back in
since adding yourself to the Docker group in Step 1. Do that once, then try again.

**No emails arrive, or login codes never come.** Check that you replaced the
example email values in `.env` (Step 5) with your real Gmail address and app
password. The app password is the special one from
https://myaccount.google.com/apppasswords, not your normal Google password.

If you are stuck, the developer can read the message in the start window, which
says plainly what went wrong.
