# Mock test system — setup

The test page **already works without any of this.** Questions are bundled into
the page and progress is stored in the browser. Everything below adds sign-in
and cross-device history. Do it when you want it, not before.

---

## What exists now

| File | What it does |
|---|---|
| `mock/index.html` | Section hub — test list, the copyright position, topic analysis |
| `mock/bihar-police-constable-test.html` | Working quiz: 25 original questions, timer, scoring, per-question explanations, weak-topic report, local history |
| `apps-script/Code.gs` | Backend to deploy when you want sign-in + Sheets |

---

## Step 1 — Create the Sheet

New Google Sheet under **zeradental3585@gmail.com**, two tabs, named exactly:

**`questions`**

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| question | option1 | option2 | option3 | option4 | answer | explain | topic | difficulty | test_id |

`answer` is **1–4** (not 0–3 — the script converts it).
`test_id` lets one sheet hold every test, e.g. `bihar-police-constable-1`.

**`attempts`**

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| timestamp | email | test | score | total | pct | wrong |

Copy the Sheet ID from its URL — the long string between `/d/` and `/edit`.

## Step 2 — Deploy the Apps Script

1. In the Sheet: **Extensions → Apps Script**
2. Paste `apps-script/Code.gs`, replacing anything there
3. Set `SHEET_ID` at the top
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` URL

## Step 3 — Create the OAuth client ID

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
2. **APIs & Services → OAuth consent screen** → External → fill the basics
3. **Credentials → Create credentials → OAuth client ID → Web application**
4. Authorised JavaScript origins: `https://www.kosieducationtimes.com`
5. Copy the client ID (ends `.apps.googleusercontent.com`)

## Step 4 — Wire it up

In `mock/bihar-police-constable-test.html`, near the bottom:

```js
var GOOGLE_CLIENT_ID = "";   // paste client ID
var APPS_SCRIPT_URL  = "";   // paste /exec URL
```

Commit, push, done. The sign-in button appears automatically once
`GOOGLE_CLIENT_ID` is set.

---

## How the login works

No passwords touch the site. The button calls Google's sign-in service, Google
shows its own account picker, and returns a signed token. The page sends that
token to Apps Script, which asks Google to verify it and trusts only the email
Google returns. `verifyEmail_()` also rejects unverified addresses.

## Capacity

Fine to roughly 100 regular users. Sheets starts to strain past a few thousand
new rows a day. If that happens, move `attempts` to Firebase and leave
`questions` in Sheets — the questions tab is read-rarely and edited by hand,
which is exactly what Sheets is good at.

---

## Adding questions — the rule that is not negotiable

Indian courts have consistently held exam question papers are copyrighted
literary works, including a Bihar School Examination Board case in Patna.

- **Write original questions.** Match syllabus, pattern and difficulty. Do not
  transcribe a past paper, and do not paraphrase one closely enough that it is
  recognisably the same question.
- **Never host official PDFs.** Link to the commission's own site.
- **The analysis is the value layer** — topic weightage, common traps, the order
  to prepare in. That is ours to write and cannot be copied from anyone.

Every question needs a real explanation. "Option B is correct" is not an
explanation; *why* it is correct is.
