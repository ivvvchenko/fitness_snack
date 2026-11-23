# Fitness Snack

Short workouts for your phone: four exercises, about four minutes, at least twice a day.

Plain HTML, CSS and JavaScript modules. No build step, no dependencies, no server.
Installs to the home screen and works offline.

## Run locally

    npm start        # http://localhost:8080
    npm test         # Node 22+

Add `?sw` to the local address to test offline mode.

## Deploy to GitHub Pages

1. Create a GitHub repository (it must be public on a free account).
2. Push this folder to its `main` branch.
3. In the repository: Settings → Pages → Source → **GitHub Actions**.
4. Run the "Test and deploy" workflow again if its first run came before step 3.

Every push to `main` runs the tests and publishes the app. If you host it elsewhere,
replace `__BUILD__` in `sw.js` with a new value on every release, otherwise installed
phones keep the old version.

## Data

Everything is kept in `localStorage` on the device. Use Settings → Save backup to keep a
copy or move to another phone. On iPhone, add the app to the Home Screen first: Safari may
clear the data of ordinary websites that were not opened for 7 days, and the Home Screen
app has its own separate storage.

## Code map

| File | Role |
|---|---|
| `js/engine.js` | Workout timer, no DOM |
| `js/game.js` | XP, levels, streaks, badges, derived from history |
| `js/stats.js` | Dashboard numbers |
| `js/model.js`, `js/store.js` | Defaults, validation, saving, backup |
| `js/player.js`, `js/sound.js` | Workout screen, synthesised sounds |
| `js/views/` | Today, Progress, Workout, Awards, Settings |
| `sw.js` | Offline cache; list new files here (a test checks it) |
