# Reel Seeker — Progress Bar for Instagram Reels

Instagram Reels on the web don't give you a scrubber — you can't jump to a spot in the video. This Chrome extension (Manifest V3) overlays a real video control bar on the reel you're watching, so you can seek, skip, pause, and change speed like any normal player.

## Features

- **Seekable progress bar** — click anywhere on the track or drag the thumb to jump to any point in the video. Shows played and buffered progress.
- **Play / pause** button (and the `k` key).
- **Skip ±10 seconds** buttons, plus the `,` / `.` keys. Arrow keys are left to Instagram's own prev/next navigation.
- **Time display** — current time and total duration.
- **Playback speed** — click to cycle 1× → 1.25× → 1.5× → 2× → 0.5×.
- **Auto-next** — toggle (or press `a`) to automatically jump to the next reel when the current one ends. Remembered across sessions.
- **Download** — a floating button in the top-right corner of the current video or post image (press `d` for videos). Grabs the highest-quality version Instagram serves.
- **Popup** — click the extension icon for an auto-next switch and a keyboard-shortcut reference.
- **Side panel** — open Instagram in Chrome's side panel (button in the popup) and keep watching while you work in other tabs. The control bar works inside the panel too.
- **Sound via Instagram's own control** — the bar leaves a click-through slot for Instagram's native audio button (so its global sound state stays in sync); `m` clicks it for you.
- **Posted date badge** — shows when the video was posted, in the top-right corner.
- The bar automatically binds to whichever video is currently playing / most on-screen and follows it as you scroll.
- Built entirely inside a Shadow DOM, so Instagram's styles never interfere with it.

## Install (load unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `ig-reels-seekbar` folder.
4. Open [instagram.com/reels](https://www.instagram.com/reels/) and start watching — the bar appears at the bottom of the reel.

## Notes

- Works **anywhere a video is on screen** — Reels (`/reels`, `/reel/...`), posts (`/p/...`), stories, and the feed. The bar hides when no video is visible.
- No permissions, no network access, no data collection — it only reads/controls the `<video>` element already on the page.
- Instagram frequently changes its markup. The extension finds videos generically (by the on-screen `<video>` element) rather than relying on Instagram's class names, which makes it resilient, but if a future redesign breaks it, the detection logic in `content/content.js` (`pickActiveVideo`) is the place to adjust.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `,` | Back 10 seconds |
| `.` | Forward 10 seconds |
| `k` | Play / pause |
| `m` | Sound on/off (Instagram's native toggle) |
| `d` | Download current video |
| `a` | Toggle auto-next |
