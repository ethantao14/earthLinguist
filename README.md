# EarthLinguist App

A lightweight web app for collecting and exploring language data. Speakers record short audio clips describing images in their own language; others can listen and read transcriptions for research or learning.

## Demo
Use demo mode (no login): add `?demo=1` or `#demo` to the URL.  
Link: https://earth-linguist.vercel.app/?demo=1

## Features
- Email/username login with Supabase
- Tabs: **Introduction**, **Listen**, **Record**
- In-browser microphone recording (MediaRecorder)
- Image grid with per-column audio playback + transcription view
- Demo mode disables uploads for safe preview

## Tech Stack
- HTML, CSS, vanilla JS
- Supabase (Auth, Postgres, Storage)
- Hosted on any static host (e.g., Vercel)
