# ReelFlow — Chrome Web Store submission draft

Copy-paste-ready content for every field the Developer Dashboard asks for.

---

## 1. Store listing

**Name** (from manifest, 52/75 chars)
> ReelFlow — Video Controls & Downloader for Instagram

**Summary** (from manifest description, 122/132 chars)
> Seek bar, playback speed, skip, auto-next and one-click downloads for Instagram Reels and posts, plus a side panel player.

**Category**
> Productivity → Tools (or "Fun" — Tools ranks better for utility searches)

**Language**
> English

**Detailed description**

```
Instagram's web player gives you almost no control — no seek bar, no speed,
no way to skip ahead. ReelFlow fixes that.

WHAT YOU GET

► Real player controls
A full control bar on every reel and video: a draggable seek bar with
buffered progress, play/pause, skip back/forward, elapsed and total time,
and playback speed (0.5× to 2×).

► Auto-next
Done with a reel? ReelFlow jumps to the next one automatically when the
video ends. Toggle it from the bar, the popup, or the "a" key.

► One-click downloads
A floating download button on reels, video posts and photos saves the
media in the highest quality Instagram serves — with a loading spinner
while it fetches.

► Side panel player
Open Instagram in Chrome's side panel and keep watching while you work in
other tabs. The control bar works inside the panel too.

► Quick settings
Click the toolbar icon to toggle auto-next and download buttons, set a
default playback speed, and choose the skip amount (5–30s).

KEYBOARD SHORTCUTS

,  skip back          .  skip forward
k  play / pause       m  sound on / off
d  download           a  toggle auto-next

PRIVACY

ReelFlow collects nothing. No analytics, no tracking, no external servers —
everything runs locally in your browser, only on instagram.com.

ReelFlow is an independent project and is not affiliated with, endorsed by,
or sponsored by Instagram or Meta Platforms, Inc.
```

---

## 2. Graphic assets

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128×128 PNG | use `icons/icon128.png` |
| Screenshots (1–5) | 1280×800 or 640×400 | `promo/popup-promo-1280x800.png` done; add player + side-panel slides |
| Small promo tile (optional) | 440×280 | todo — can generate in the promo style |
| Marquee promo tile (optional) | 1400×560 | todo |

---

## 3. Privacy tab

**Single purpose description**
> ReelFlow adds video player controls to Instagram's website: a seek bar with play/pause, skip and playback speed, optional auto-advance to the next reel, media download buttons, and a side panel for watching Instagram alongside other tabs.

**Permission justifications**

- `host permissions (*://*.instagram.com/*)`
  > Required to inject the player control bar into Instagram pages and to read the video elements it controls. The extension runs only on instagram.com.

- `scripting`
  > Used by the popup to read and apply the user's settings (auto-next, default speed, skip amount) in the active Instagram tab.

- `sidePanel`
  > Lets the user open Instagram in Chrome's side panel to keep watching while working in other tabs.

- `declarativeNetRequest`
  > Modifies headers only for instagram.com sub-frame requests so Instagram can load inside the extension's side panel (Instagram otherwise blocks being embedded). No other traffic is inspected or modified.

**Remote code**
> No, I am not using remote code. (All JS is packaged; nothing is fetched or eval'd.)

**Data usage**
> Check NONE of the data-collection boxes. Certify: "This item does not collect user data."

**Privacy policy URL**
> http://universalcalculators.net/plugin/reelflow/privacy
> (Host a short page: "ReelFlow does not collect, store, or transmit any user data. All functionality runs locally in the browser on instagram.com pages. Downloads are saved directly to the user's device." Add a contact email.)

---

## 4. Distribution

- **Visibility**: Public (or Unlisted for a soft launch — link-only installs)
- **Regions**: All regions
- **Pricing**: Free

---

## 5. Pre-submission checklist (important)

1. **Upload the PLAIN build, not the obfuscated one.** The Web Store rejects
   obfuscated code. Zip the source folders (manifest, content/, popup/,
   panel/, icons/, rules.json, background.js) — do NOT submit `dist/`.
2. Manifest `version` is `1.0.0` — bump for every future upload.
3. The install-redirect to universalcalculators.net is allowed, but the page
   must exist and load before review; a dead link risks rejection.
4. Trademark: name keeps "for Instagram" descriptive (never leading), the
   icon must not imitate Instagram's logo, and the description carries the
   non-affiliation disclaimer.
5. Downloader note: media-download extensions are permitted, but reviewers
   check that the listing doesn't encourage copyright infringement — the
   description above deliberately stays neutral ("saves the media").
6. Screenshots must not show third-party creators' content without care —
   use your own reel/post in the player screenshot.
7. Developer account: one-time $5 registration fee, and email verification
   must be done before the item can be published.
