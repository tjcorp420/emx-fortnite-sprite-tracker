# EMX Fortnite Sprite Tracker

EMX Tweaks' Fortnite Sprite collection tracker. The web app is a responsive PWA; the Windows desktop app is packaged with Tauri and uses the public GitHub Releases repository for one-click installer updates.

## Local development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set the Supabase URL and publishable/anon key in `.env.local` to enable EMX accounts, cloud saves, shared trackers, achievements, and leaderboard participation. Epic Games login is never used.

## Windows builds

```powershell
npm run build
npm run tauri:build
```

The installer, portable executable, and MSI are created in `src-tauri/target/release/bundle/` and can be copied to `outputs/` for local testing. The production EXE has no console window.

## Publishing an update

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and the lockfile if needed.
2. Commit the change and create a tag such as `v1.2.0`.
3. Push the tag to GitHub.

The Windows release workflow builds the installer and publishes an asset named `EMX-Fortnite-Sprite-Tracker-Setup.exe`. The desktop app checks the latest GitHub Release, compares its version, downloads only that installer, waits for the app to close, runs the installer elevated, and restarts through the normal installer flow. The PWA has no desktop updater button; web deployments update through Vercel.

## Data and branding

Sprite data, verified released artwork, unreleased outlines, EMX branding, Supabase integration, and local progress are kept in this repository. No Epic account credentials are collected.
