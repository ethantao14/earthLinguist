# EarthLinguist App

A lightweight web app for **collecting and exploring language data** through picture-based prompts and short audio recordings. Speakers record how they would describe images in their own language; listeners and researchers can browse clips and read transcriptions/annotations.

> Built with a **static front end** (HTML/CSS/JS) and **Supabase** for auth, database, and storage.

---

## Table of Contents
- [Demo](#demo)
- [Features](#features)
- [App Flow](#app-flow)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Supabase Setup](#supabase-setup)
  - [Local Development](#local-development)
  - [Configuration](#configuration)
- [Database Model](#database-model)
- [Storage](#storage)
- [Security Notes](#security-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Demo

- **Recruiter demo mode** (no login): append `?demo=1` **or** `#demo` to the URL.  
  Example: `https://your-site.vercel.app/?demo=1`

Demo mode:
- Hides auth UI
- Greets as “Anonymous”
- Disables submission (upload) with a friendly message

---

## Features

- **Auth (email + password or username)** via Supabase
- **Tabbed UI**
  - **Introduction** – project purpose & consent notice
  - **Listen** – filter examples by language/label, view picture grids, play audio, read transcriptions
  - **Record** – 3-step wizard:
    1) Details (language, location)  
    2) Select example & **record in-browser** (Web Audio API)  
    3) Enter **transcriptions** and submit
- **Filters & tables** for examples, images, and audio clips
- **Uploader** to Supabase Storage (`user-recordings` bucket), with public URLs saved to DB
- **Recruiter-friendly** demo flow (no sign-in, no writes)

---

## App Flow

1. **Login/Sign Up** (or use Demo Mode)  
2. **Listen** tab  
   - Filter by *Language* and *Label*  
   - See an image table with per-column audio “Play” buttons  
   - View a transcription table for the selected example
3. **Record** tab (3-step wizard)  
   - Step 1: Enter language & location  
   - Step 2: Pick an example; press **Record** for each column; preview takes  
   - Step 3: Add **Your Transcription** for each clip; **Submit** uploads audio and inserts DB rows

---

## Tech Stack

- **Frontend:** HTML5, vanilla JS, CSS (Inter font)
- **Auth/DB/Storage:** Supabase (`@supabase/supabase-js@2`)
- **Media:** `navigator.mediaDevices.getUserMedia` + `MediaRecorder`
- **Hosting:** Any static host (e.g., Vercel, Netlify, GitHub Pages)

---

## Project Structure

```
.
├─ index.html                  # Main app (tabs, forms, tables)
├─ css/
│  └─ linguisticsFrontEnd.css  # Styles (tabs, wizard, tables, auth)
├─ js/
│  └─ linguisticsFrontEnd.js   # App logic (auth, tabs, fetch, record, upload)
└─ images/
   └─ checkmark.png            # UI asset for table checkmarks
```

---

## Getting Started

### Prerequisites
- A **Supabase** project (free tier is fine)
- A **Storage bucket** for user recordings
- A **static web server** (for local dev)  
  - `npx serve` **or** `python -m http.server`
- **HTTPS** origin for microphone access (browsers require a secure context). `http://localhost` is also permitted.

### Supabase Setup

1. **Create a project** in Supabase and note:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (client key)

2. **Enable Email Auth** in Supabase (Authentication → Providers → Email).

3. **Create a Storage bucket** named `user-recordings` (Public recommended for this prototype).

4. **Create tables** (names used in code):
   - `profiles` — stores user profile metadata (id, first_name, last_name, username, email)
   - `images` — images for a given example label (id, label, path, position)
   - `audio_clips` — audio metadata (id, user_id, session_id, label, language, path, position, transcription, annotation, created_at, verified)
   - `image_audio_map` — which image row has a checkmark in which audio column (image_id, column, has_check)
   - `recording_sessions` — one row per submission (id, user_id, label, language, location, created_at)

> Tip: Start with minimal columns; you can evolve the schema. See **Database Model** below for suggested columns.

5. **RLS Policies**  
   For a prototype you can disable RLS, but in general:
   - **Enable RLS** and write policies to:
     - allow **public read** of *approved* clips and images
     - allow **authenticated users** to insert their own `recording_sessions` and `audio_clips`
     - restrict updates/deletes appropriately

### Local Development

1. Clone this repo and install nothing (pure static site).
2. Add your Supabase credentials (see [Configuration](#configuration)).
3. Serve the site:
   ```bash
   # Option A
   npx serve

   # Option B
   python -m http.server 8080
   ```
4. Open the URL shown in the terminal.  
   For demo: `http://localhost:8080/?demo=1`

> **Microphone:** Browsers require HTTPS (or `localhost`) to record audio.

### Configuration

In `js/linguisticsFrontEnd.js`, locate and set:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';
```

---

## Database Model

Suggested columns (you can adapt names/types).

(See full table definitions in the draft above.)

---

## Storage

- Bucket: **`user-recordings`** (Public for prototype)
- Upload: `supabase.storage.from('user-recordings').upload(fileName, blob)`
- Public URL: `supabase.storage.from('user-recordings').getPublicUrl(fileName)`
- Saved into `audio_clips.path`

---

## Security Notes

- The **anon key** is a *public client key* by design, but **RLS must protect your data**. Do not rely on “security by obscurity.”
- The app currently allows public reading of examples. Add moderation by gating `audio_clips.verified = true` in your fetch queries and policies.
- Review/adjust the **consent language** shown in the Introduction tab to match your IRB/PI/legal requirements.

---

## Roadmap

- [ ] Replace hardcoded keys with env-injected runtime config
- [ ] Add pagination & de-duplication to example lists
- [ ] “My Submissions” page
- [ ] Basic moderation workflow (verify clips)
- [ ] Accessibility pass (keyboard focus states, ARIA labels for buttons)
- [ ] Analytics for research usage
- [ ] Optional S3/Cloudflare R2 backend via Supabase

---

## Contributing

1. Fork → create a feature branch
2. Keep HTML/JS/CSS **accessible and vanilla** (no build step required)
3. Submit a PR with a short demo clip / screenshots if UI changes

---

## License

Choose a license (e.g., **MIT**) and update this section.  
If this is tied to an academic project with special data terms, include those here.
