/*
 * Reel Seeker — a real progress bar for Instagram Reels on the web.
 *
 * Instagram removes native <video> controls, so we overlay our own control bar
 * that binds to whichever reel video is currently active (playing / most
 * visible). The bar tracks the video's on-screen position each frame.
 *
 * Everything lives in a Shadow DOM so Instagram's CSS can't touch it.
 */
(function () {
  "use strict";

  // Run in the top frame or in our side panel's iframe — but not in IG's
  // public embed frames (instagram.com/.../embed/ on third-party sites).
  if (window.top !== window.self && /\/embed(\/|$)/.test(location.pathname))
    return;
  if (window.__reelSeekerLoaded) return;
  window.__reelSeekerLoaded = true;

  const BAR_H = 44;
  const SPEEDS = [1, 1.25, 1.5, 2, 0.5];

  // ---- URL reporting --------------------------------------------------
  // The side panel hosts us in a cross-origin iframe, so it cannot read our
  // location — postMessage is the only channel out. Driven from the rAF loop
  // rather than its own timer: it is a string compare per frame, and it means
  // Instagram's SPA navigations (which never reload the page) are reported
  // just like full loads.
  const inFrame = window.parent !== window;
  let lastHref = "";
  let urlChangedAt = 0;
  function reportUrl() {
    if (!inFrame || location.href === lastHref) return;
    lastHref = location.href;
    urlChangedAt = performance.now();
    try {
      // "*" as the target: the parent is an extension page whose origin we
      // can't know here. The only thing disclosed is the URL of the page
      // doing the framing, which the framer already chose.
      window.parent.postMessage({ __reelSeeker: "url", href: lastHref }, "*");
    } catch (e) {}
  }

  // ---- Broken-layout detection ------------------------------------------
  // Instagram chooses its layout when the document loads and keeps that choice
  // for the whole SPA session. A frame that booted narrow therefore stays in
  // the mobile layout — no next-reel arrows — even after the panel is widened,
  // because in-app navigation never re-requests the document. Only a real load
  // re-measures.
  //
  // Panel width can't tell us this happened (the frame may have booted narrow
  // and been widened since), so look for the arrows themselves: on a reel URL,
  // if they haven't appeared shortly after the URL settled, ask the panel to
  // re-boot. Signalled at most once per URL, so it can never become a loop.
  const LAYOUT_GRACE_MS = 2500;
  let reloadAskedFor = "";

  function hasNextReelArrow() {
    return !!(
      document.querySelector('div[aria-label="Navigate to next reel"]') ||
      document.querySelector('[aria-label*="next reel" i][role="button"]')
    );
  }

  function checkLayout() {
    if (!inFrame) return;
    if (!/^\/reels\//.test(location.pathname)) return;
    if (reloadAskedFor === location.href) return;
    // Give Instagram time to render before judging the layout broken.
    if (performance.now() - urlChangedAt < LAYOUT_GRACE_MS) return;
    if (hasNextReelArrow()) return;
    reloadAskedFor = location.href;
    try {
      window.parent.postMessage(
        { __reelSeeker: "needsReload", href: location.href },
        "*",
      );
    } catch (e) {}
  }

  // ---- Side panel: keep IG's left nav rail collapsed --------------------
  // In the panel, hovering the nav rail expands it over the content. Two
  // defenses: (1) swallow every hover-family event whose target is anywhere
  // in the nav's outer container, at capture phase, before IG's listeners
  // see them; (2) each frame, if the rail's inline width grew anyway, snap
  // it back to 72px — this also un-sticks a rail that got stuck open.
  // Clicks are separate events and still work.
  const NAV_RAIL_W = "72px";
  let navRoot = null;
  let navRail = null;
  let navAt = 0;
  function findNav() {
    const now = performance.now();
    if (navAt && now - navAt < 2000 && navRoot && navRoot.isConnected) return;
    navAt = now;
    navRoot = null;
    navRail = null;
    const reels = document.querySelector('a[href="/reels/"]');
    if (!reels) return;
    // The rail is the first ancestor of the Reels nav link with an inline
    // width (72px collapsed); the root is the whole nav region around it.
    let el = reels.parentElement;
    while (el && el !== document.body) {
      if (el.style && el.style.width) {
        navRail = el;
        break;
      }
      el = el.parentElement;
    }
    navRoot = reels.closest('div[tabindex="-1"]') || navRail;
  }
  function keepNavCollapsed() {
    if (!inFrame) return;
    findNav();
    if (navRail) {
      const w = parseFloat(navRail.style.width);
      if (w && w > 100) navRail.style.width = NAV_RAIL_W;
    }
  }
  if (inFrame) {
    [
      "mouseover",
      "mouseout",
      "mouseenter",
      "mouseleave",
      "pointerover",
      "pointerout",
      "pointerenter",
      "pointerleave",
      "mousemove",
      "pointermove"
    ].forEach(function (type) {
      document.addEventListener(
        type,
        function (e) {
          findNav();
          if (navRoot && e.target instanceof Node && navRoot.contains(e.target)) {
            e.stopPropagation();
          }
        },
        true
      );
    });
  }

  let activeVideo = null;
  let dragging = false;
  let hovering = false;
  let autoNext = false;
  let lastAutoAdvance = 0;
  let autoNextSuppressUntil = 0; // set on manual seeks so they don't look like a loop-wrap

  // ---- Shadow host ----------------------------------------------------

  const hostEl = document.createElement("div");
  hostEl.id = "reel-seeker-host";
  hostEl.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
  const shadow = hostEl.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    #bar {
      position: fixed; display: none; align-items: center; gap: 10px;
      height: ${BAR_H}px; padding: 0 12px;
      background: linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,.35) 70%, rgba(0,0,0,0));
      border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #fff; user-select: none; -webkit-user-select: none;
      pointer-events: none;
    }
    #bar.show { display: flex; }
    .btn, .track { pointer-events: auto; }

    /* Empty slot at the end where Instagram's own audio button sits —
       clicks fall through the bar to it. */
    .ig-slot { width: 44px; flex-shrink: 0; }

    .btn {
      background: none; border: none; color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      padding: 4px; border-radius: 6px; flex-shrink: 0; opacity: .95;
    }
    .btn:hover { background: rgba(255,255,255,.18); opacity: 1; }
    .btn svg { width: 20px; height: 20px; display: block; fill: #fff; }
    .btn.small svg { width: 18px; height: 18px; }
    .btn.on svg { fill: #ff2d6f; }

    .time { font-size: 12px; font-variant-numeric: tabular-nums;
      flex-shrink: 0; text-shadow: 0 1px 2px rgba(0,0,0,.6); min-width: 34px; }
    .time.dur { text-align: right; }

    .track {
      position: relative; flex: 1; height: 16px; cursor: pointer;
      display: flex; align-items: center;
    }
    .rail {
      position: absolute; left: 0; right: 0; height: 4px; border-radius: 4px;
      background: rgba(255,255,255,.32);
    }
    .buffered {
      position: absolute; left: 0; height: 4px; border-radius: 4px;
      background: rgba(255,255,255,.45); width: 0;
    }
    .fill {
      position: absolute; left: 0; height: 4px; border-radius: 4px;
      background: #ff2d6f; width: 0;
    }
    .thumb {
      position: absolute; width: 13px; height: 13px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5);
      transform: translateX(-50%); left: 0; opacity: 0;
      transition: opacity .12s ease;
    }
    .track:hover .thumb, #bar.dragging .thumb { opacity: 1; }
    .track:hover .rail, .track:hover .buffered, .track:hover .fill { height: 6px; }

    .speed {
      font-size: 12px; font-weight: 700; min-width: 40px; text-align: center;
      padding: 4px 6px;
    }

    #posted {
      position: fixed; display: none; transform: translateX(-100%);
      padding: 4px 10px; border-radius: 999px;
      background: rgba(0,0,0,.6); color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px; font-weight: 600; white-space: nowrap;
      pointer-events: none; user-select: none; -webkit-user-select: none;
    }

    /* Floating download button over post images (videos get the bar's). */
    #imgdl {
      position: fixed; display: none; align-items: center; justify-content: center;
      width: 36px; height: 36px; padding: 0; border: none; border-radius: 50%;
      background: rgba(0,0,0,.6); cursor: pointer;
    }
    #imgdl:hover { background: rgba(0,0,0,.85); }
    #imgdl svg { width: 20px; height: 20px; fill: #fff; }
    #imgdl.loading { cursor: default; }
    #imgdl.loading svg { display: none; }
    #imgdl.loading::after {
      content: ""; width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
      animation: rs-spin .7s linear infinite;
    }
    @keyframes rs-spin { to { transform: rotate(360deg); } }
  `;
  shadow.appendChild(style);

  // ---- Icons ----------------------------------------------------------

  const IC = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back10:
      '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>' +
      '<text x="12" y="15.5" font-size="7" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">10</text></svg>',
    fwd10:
      '<svg viewBox="0 0 24 24"><path d="M12 5V1l5 5-5 5V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7z"/>' +
      '<text x="12" y="15.5" font-size="7" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">10</text></svg>',
    autoNext:
      '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>',
    download:
      '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>'
  };

  // ---- Build bar ------------------------------------------------------

  const bar = document.createElement("div");
  bar.id = "bar";

  const backBtn = mkBtn("small", IC.back10, "Back 10s (,)");
  const playBtn = mkBtn("", IC.play, "Play/Pause (k)");
  const fwdBtn = mkBtn("small", IC.fwd10, "Forward 10s (.)");
  const curTime = mkSpan("time cur", "0:00");
  const track = document.createElement("div");
  track.className = "track";
  const rail = mkDiv("rail");
  const buffered = mkDiv("buffered");
  const fill = mkDiv("fill");
  const thumb = mkDiv("thumb");
  track.append(rail, buffered, fill, thumb);
  const durTime = mkSpan("time dur", "0:00");
  const speedBtn = mkBtn("speed", null, "Playback speed");
  speedBtn.textContent = "1×";
  const autoNextBtn = mkBtn("small", IC.autoNext, "Auto-next reel (a)");
  const igSlot = mkDiv("ig-slot");

  bar.append(
    backBtn,
    playBtn,
    fwdBtn,
    curTime,
    track,
    durTime,
    speedBtn,
    autoNextBtn,
    igSlot
  );
  shadow.appendChild(bar);

  const dateBadge = document.createElement("div");
  dateBadge.id = "posted";
  shadow.appendChild(dateBadge);

  const imgDl = document.createElement("button");
  imgDl.id = "imgdl";
  imgDl.innerHTML = IC.download;
  imgDl.title = "Download (d)";
  shadow.appendChild(imgDl);

  function mount() {
    (document.body || document.documentElement).appendChild(hostEl);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  function mkBtn(cls, svg, title) {
    const b = document.createElement("button");
    b.className = "btn" + (cls ? " " + cls : "");
    if (svg) b.innerHTML = svg;
    if (title) b.title = title;
    return b;
  }
  function mkDiv(cls) {
    const d = document.createElement("div");
    d.className = cls;
    return d;
  }
  function mkSpan(cls, txt) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = txt;
    return s;
  }

  // ---- Helpers --------------------------------------------------------

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // Ancestors that clip their content (overflow hidden/clip/scroll/auto).
  // Carousel posts keep every slide's <video> in the DOM, just translated
  // sideways inside an overflow-hidden list — so a raw rect looks on-screen
  // even when the slide is not the one showing. Cached per video and
  // refreshed every 2s (the ancestor chain rarely changes).
  function getClippers(v) {
    const now = performance.now();
    if (v.__rsClipsAt && now - v.__rsClipsAt < 2000) return v.__rsClips;
    v.__rsClipsAt = now;
    const clips = [];
    let el = v.parentElement;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/hidden|clip|scroll|auto/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        clips.push(el);
      }
      el = el.parentElement;
    }
    v.__rsClips = clips;
    return clips;
  }

  // The video's rect intersected with all clipping ancestors; null when the
  // video is fully clipped away (e.g. an inactive carousel slide).
  function visibleRect(v, r) {
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    const clips = getClippers(v);
    for (let i = 0; i < clips.length; i++) {
      const cr = clips[i].getBoundingClientRect();
      if (cr.left > left) left = cr.left;
      if (cr.top > top) top = cr.top;
      if (cr.right < right) right = cr.right;
      if (cr.bottom < bottom) bottom = cr.bottom;
      if (right - left < 1 || bottom - top < 1) return null;
    }
    return { left: left, top: top, right: right, bottom: bottom };
  }

  function pickActiveVideo() {
    const vids = document.querySelectorAll("video");
    let best = null;
    let bestScore = -1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    vids.forEach(function (v) {
      const r = v.getBoundingClientRect();
      if (r.width < 120 || r.height < 120) return; // ignore tiny/thumbnails
      const c = visibleRect(v, r);
      if (!c) return; // clipped away — inactive carousel slide
      const visW = Math.max(0, Math.min(c.right, vw) - Math.max(c.left, 0));
      const visH = Math.max(0, Math.min(c.bottom, vh) - Math.max(c.top, 0));
      let score = visW * visH;
      if (score <= 0) return;
      if (!v.paused && !v.ended) score *= 3; // strongly prefer the one playing
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    });
    return best;
  }

  // The main post image on screen — same visibility rules as videos, but
  // only inside an <article> (feed/post), which keeps profile grids and
  // avatars out.
  function pickActiveImage() {
    const imgs = document.querySelectorAll("article img");
    let best = null;
    let bestScore = -1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    imgs.forEach(function (im) {
      const r = im.getBoundingClientRect();
      if (r.width < 240 || r.height < 240) return;
      if (/profile picture/i.test(im.getAttribute("alt") || "")) return;
      const c = visibleRect(im, r);
      if (!c) return;
      const visW = Math.max(0, Math.min(c.right, vw) - Math.max(c.left, 0));
      const visH = Math.max(0, Math.min(c.bottom, vh) - Math.max(c.top, 0));
      const score = visW * visH;
      if (score > bestScore) {
        bestScore = score;
        best = im;
      }
    });
    return best;
  }

  // ---- Download ---------------------------------------------------------

  // The media object in IG's React props carries direct CDN URLs —
  // video_versions for videos (the <video> src is often an undownloadable
  // blob: URL), image_versions2 for photos. IG mixes two shapes: snake_case
  // (private API) and camelCase / GraphQL fields — accept all of them.
  function isMediaObj(obj) {
    return !!(
      obj.video_versions ||
      obj.videoVersions ||
      obj.image_versions2 ||
      obj.imageVersions2 ||
      obj.video_url ||
      obj.display_url
    );
  }

  function videoUrlFrom(m) {
    if (!m) return null;
    const vv = m.video_versions || m.videoVersions;
    if (vv && vv.length) return vv[0].url; // first entry = highest quality
    if (typeof m.video_url === "string") return m.video_url;
    return null;
  }

  function imageUrlFrom(m) {
    if (!m) return null;
    const iv = m.image_versions2 || m.imageVersions2;
    if (iv && iv.candidates && iv.candidates.length) return iv.candidates[0].url;
    if (typeof m.display_url === "string") return m.display_url;
    return null;
  }

  function mediaFromObj(obj, depth) {
    if (!obj || typeof obj !== "object") return null;
    if (isMediaObj(obj)) return obj;
    if (depth <= 0) return null;
    for (const k in obj) {
      if (k === "children") continue;
      const val = obj[k];
      if (!val || typeof val !== "object") continue;
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && i < 3; i++) {
          const r = mediaFromObj(val[i], depth - 1);
          if (r) return r;
        }
      } else {
        const r = mediaFromObj(val, depth - 1);
        if (r) return r;
      }
    }
    return null;
  }

  function reactMedia(el) {
    let fiber = null;
    for (const k in el) {
      if (k.indexOf("__reactFiber$") === 0) {
        fiber = el[k];
        break;
      }
    }
    for (let d = 0; fiber && d < 60; d++, fiber = fiber.return) {
      const m = mediaFromObj(fiber.memoizedProps, 3);
      if (m) return m;
    }
    return null;
  }

  function igFilename(m, ext) {
    const code = m && (m.code || m.pk || m.id);
    return "instagram-" + (code || Date.now()) + "." + ext;
  }

  // A post's shortcode is the media id (pk) encoded in IG's base64 alphabet.
  // Extended share codes append extra data — the pk is the first 11 chars.
  function shortcodeToPk(code) {
    code = code.slice(0, 11);
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let n = 0n;
    for (let i = 0; i < code.length; i++) {
      const idx = chars.indexOf(code[i]);
      if (idx < 0) return null;
      n = n * 64n + BigInt(idx);
    }
    return n.toString();
  }

  // Shortcode for the media element: a permalink inside its <article> (feed),
  // else the page URL (/p/…, /reel/…, /reels/… all carry it).
  function shortcodeFor(el) {
    const art = el.closest ? el.closest("article") : null;
    if (art) {
      const a = art.querySelector("a[href*='/p/'], a[href*='/reel/']");
      const m =
        a && a.getAttribute("href").match(/\/(?:p|reels?)\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
    const m2 = location.pathname.match(/\/(?:p|reels?)\/([A-Za-z0-9_-]+)/);
    return m2 ? m2[1] : null;
  }

  // IG's own media-info API — same-origin, session-authenticated. This is
  // the fallback when React props don't expose the media (desktop reels
  // stream via MSE, so video.src is an unusable blob: URL).
  function fetchMediaInfo(pk) {
    return fetch("https://www.instagram.com/api/v1/media/" + pk + "/info/", {
      credentials: "include",
      headers: { "x-ig-app-id": "936619743392459" }
    })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        return (j && j.items && j.items[0]) || null;
      });
  }

  function apiMediaForEl(el, wantVideo) {
    const code = shortcodeFor(el);
    const pk = code && shortcodeToPk(code);
    if (!pk) return Promise.resolve(null);
    return fetchMediaInfo(pk)
      .then(function (item) {
        if (!item) return null;
        let m = item;
        if (item.carousel_media && item.carousel_media.length) {
          m = null;
          for (let i = 0; i < item.carousel_media.length; i++) {
            const cm = item.carousel_media[i];
            if (wantVideo ? videoUrlFrom(cm) : imageUrlFrom(cm)) {
              m = cm;
              break;
            }
          }
          if (!m) m = item.carousel_media[0];
        }
        const url = wantVideo ? videoUrlFrom(m) : imageUrlFrom(m);
        return url
          ? { url: url, name: igFilename(item, wantVideo ? "mp4" : "jpg") }
          : null;
      })
      .catch(function () {
        return null;
      });
  }

  // Fetch → blob → <a download>. A plain <a download> would be ignored
  // cross-origin; the CDN sends CORS headers, so fetching works. If it
  // doesn't, open the raw URL so the user can save it manually.
  function downloadUrl(url, name) {
    return fetch(url, { credentials: "omit", mode: "cors" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      })
      .then(function (b) {
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(u);
        }, 4000);
      })
      .catch(function () {
        window.open(url, "_blank");
      });
  }

  function downloadActiveVideo() {
    const v = activeVideo;
    if (!v) return Promise.resolve();
    const m = reactMedia(v);
    let url = videoUrlFrom(m);
    const src = v.currentSrc || v.src || "";
    if (!url && /^https?:/.test(src)) url = src;
    if (url) return downloadUrl(url, igFilename(m, "mp4"));
    return apiMediaForEl(v, true).then(function (res) {
      if (res) return downloadUrl(res.url, res.name);
      console.warn("[Reel Seeker] no downloadable video URL found");
    });
  }

  // Largest srcset candidate — currentSrc may be a smaller responsive pick.
  function bestImageUrl(im) {
    let url = im.currentSrc || im.src;
    if (im.srcset) {
      let bestW = 0;
      im.srcset.split(",").forEach(function (part) {
        const bits = part.trim().split(/\s+/);
        const w = parseInt(bits[1], 10) || 0;
        if (w > bestW) {
          bestW = w;
          url = bits[0];
        }
      });
    }
    return url;
  }

  function downloadImage(im) {
    const m = reactMedia(im);
    let url = imageUrlFrom(m);
    if (!url) url = bestImageUrl(im);
    if (url) return downloadUrl(url, igFilename(m, "jpg"));
    return apiMediaForEl(im, false).then(function (res) {
      if (res) return downloadUrl(res.url, res.name);
      console.warn("[Reel Seeker] no downloadable image URL found");
    });
  }

  // Busy state: the floating button becomes a spinner until the download
  // (fetch + save) settles; further clicks are ignored meanwhile.
  let dlBusy = false;
  function triggerDownload() {
    if (dlBusy) return;
    const isVideo = !!activeVideo;
    if (!isVideo && !imgDl.__target) return;
    dlBusy = true;
    imgDl.classList.add("loading");
    const done = function () {
      dlBusy = false;
      imgDl.classList.remove("loading");
    };
    const p = isVideo ? downloadActiveVideo() : downloadImage(imgDl.__target);
    Promise.resolve(p).then(done, done);
  }

  // One floating button at the top-right of the active media — the video
  // when one is playing, the main post image otherwise.
  function updateImgDl(v) {
    const target = v || pickActiveImage();
    if (!target) {
      imgDl.style.display = "none";
      imgDl.__target = null;
      imgDl.__isVideo = false;
      return;
    }
    imgDl.__target = target;
    imgDl.__isVideo = !!v;
    const r = target.getBoundingClientRect();
    imgDl.style.display = "flex";
    imgDl.style.left = Math.min(r.right, window.innerWidth) - 44 + "px";
    imgDl.style.top = Math.max(r.top, 0) + 8 + "px";
  }

  function positionBar(v) {
    const r = v.getBoundingClientRect();
    const vw = window.innerWidth;
    let width = Math.min(r.width, vw);
    let left = Math.max(0, r.left);
    if (left + width > vw) width = vw - left;
    bar.style.left = left + "px";
    bar.style.width = width + "px";
    bar.style.top = r.bottom - BAR_H + "px";
  }

  // ---- Posted date badge ----------------------------------------------

  // The reels feed usually has no <time> element, but IG's React props on
  // the video's fiber tree carry the media object with taken_at (unix
  // seconds). Look for taken_at / taken_at_timestamp up to 2 levels deep in
  // a props object, skipping React children.
  function takenAtFrom(obj, depth) {
    if (!obj || typeof obj !== "object") return null;
    let t = obj.taken_at != null ? obj.taken_at : obj.taken_at_timestamp;
    if (typeof t === "number" && t > 1e9) {
      return t > 1e12 ? t / 1000 : t; // ms → s just in case
    }
    if (depth <= 0) return null;
    for (const k in obj) {
      if (k === "children") continue;
      const val = obj[k];
      if (!val || typeof val !== "object") continue;
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && i < 3; i++) {
          const r = takenAtFrom(val[i], depth - 1);
          if (r) return r;
        }
      } else {
        const r = takenAtFrom(val, depth - 1);
        if (r) return r;
      }
    }
    return null;
  }

  function reactTakenAt(v) {
    let fiber = null;
    for (const k in v) {
      if (k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactProps$") === 0) {
        fiber = v[k];
        if (k.indexOf("__reactProps$") === 0) {
          const t = takenAtFrom(fiber, 2);
          if (t) return t;
          fiber = null;
        }
        if (fiber) break;
      }
    }
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
      const t = takenAtFrom(fiber.memoizedProps, 2);
      if (t) return t;
    }
    return null;
  }

  // Cache per video: once found it sticks; misses retry once a second.
  function postedLabel(v) {
    if (v.__rsDateLabel) return v.__rsDateLabel;
    const now = performance.now();
    if (v.__rsDateAt && now - v.__rsDateAt < 1000) return null;
    v.__rsDateAt = now;

    let d = null;
    // 1) <time datetime="..."> if IG rendered one (single-reel pages)
    let root = v.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const t = root.querySelector("time[datetime]");
      if (t) {
        d = new Date(t.getAttribute("datetime"));
        break;
      }
      root = root.parentElement;
    }
    // 2) React props fallback (reels feed)
    if (!d || isNaN(d)) {
      const ts = reactTakenAt(v);
      if (ts) d = new Date(ts * 1000);
    }
    if (!d || isNaN(d)) return null;

    v.__rsDateLabel =
      "Posted " +
      d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    return v.__rsDateLabel;
  }

  function updateDateBadge(v) {
    const label = postedLabel(v);
    if (!label) {
      dateBadge.style.display = "none";
      return;
    }
    if (dateBadge.textContent !== label) dateBadge.textContent = label;
    const r = v.getBoundingClientRect();
    dateBadge.style.display = "block";
    // 54px in from the right edge — clear of the download button (36px + gaps).
    dateBadge.style.left = Math.min(r.right, window.innerWidth) - 54 + "px";
    dateBadge.style.top = Math.max(r.top, 0) + 14 + "px";
  }

  // ---- UI update loop -------------------------------------------------

  function updateUI(v) {
    const dur = v.duration;
    const cur = v.currentTime;
    const hasDur = isFinite(dur) && dur > 0;

    if (!dragging) {
      const pct = hasDur ? (cur / dur) * 100 : 0;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
    }
    // buffered
    try {
      if (v.buffered && v.buffered.length && hasDur) {
        const end = v.buffered.end(v.buffered.length - 1);
        buffered.style.width = Math.min(100, (end / dur) * 100) + "%";
      }
    } catch (e) {
      /* ignore */
    }

    const curStr = fmt(cur);
    if (curTime.textContent !== curStr) curTime.textContent = curStr;
    const durStr = hasDur ? fmt(dur) : "–:–";
    if (durTime.textContent !== durStr) durTime.textContent = durStr;

    // IMPORTANT: only rewrite button contents when the state actually changes.
    // Rewriting innerHTML every frame would delete the node mid-click and
    // swallow the click event.
    const playState = v.paused ? "play" : "pause";
    if (playBtn.__state !== playState) {
      playBtn.__state = playState;
      playBtn.innerHTML = v.paused ? IC.play : IC.pause;
    }
    const sp = v.playbackRate || 1;
    const spStr = sp + "×";
    if (speedBtn.textContent !== spStr) speedBtn.textContent = spStr;
  }

  function loop() {
    requestAnimationFrame(loop);
    // Above the early return below — the URL still changes on pages with no
    // video (profiles, explore), and the panel's address bar should follow.
    reportUrl();
    checkLayout();
    // Same: the nav rail must stay collapsed on video-less pages too.
    keepNavCollapsed();
    const v = pickActiveVideo();
    updateImgDl(v);
    if (!v) {
      hide();
      return;
    }
    // Scrolled to a different reel — drop the previous one's intent so it can
    // autoplay/behave normally if revisited.
    if (activeVideo && activeVideo !== v) {
      activeVideo.__rsWantPaused = undefined;
      activeVideo.__rsWantMuted = undefined;
    }
    activeVideo = v;
    ensureHooks(v);
    bar.classList.add("show");
    positionBar(v);
    updateUI(v);
    updateDateBadge(v);
    maybeAutoNext(v);
  }

  function hide() {
    if (!dragging) {
      bar.classList.remove("show");
      dateBadge.style.display = "none";
      activeVideo = null;
    }
  }

  requestAnimationFrame(loop);

  // ---- Controls -------------------------------------------------------

  // Instagram re-applies its own paused/muted state from React, fighting our
  // direct changes. We record the user's intent on the element and re-enforce
  // it whenever Instagram flips it back.
  function ensureHooks(v) {
    if (v.__rsHooked) return;
    v.__rsHooked = true;
    v.addEventListener("play", function () {
      if (v.__rsWantPaused === true) {
        // IG resumed against the user's wish — pause again next tick.
        setTimeout(function () {
          if (v.__rsWantPaused === true) v.pause();
        }, 0);
      }
    });
    v.addEventListener("volumechange", function () {
      if (v.__rsWantMuted != null && v.muted !== v.__rsWantMuted) {
        v.muted = v.__rsWantMuted;
      }
    });
  }

  function togglePlay() {
    if (!activeVideo) return;
    const v = activeVideo;
    ensureHooks(v);
    if (v.paused) {
      v.__rsWantPaused = false;
      const p = v.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      v.__rsWantPaused = true;
      v.pause();
    }
    updateUI(v);
  }
  function skip(sec) {
    if (!activeVideo || !isFinite(activeVideo.duration)) return;
    autoNextSuppressUntil = performance.now() + 800;
    activeVideo.currentTime = Math.max(
      0,
      Math.min(activeVideo.duration, activeVideo.currentTime + sec)
    );
  }
  function cycleSpeed() {
    if (!activeVideo) return;
    const cur = activeVideo.playbackRate || 1;
    let idx = SPEEDS.indexOf(cur);
    idx = (idx + 1) % SPEEDS.length;
    activeVideo.playbackRate = SPEEDS[idx];
    updateUI(activeVideo);
  }
  function toggleMute() {
    if (!activeVideo) return;
    const v = activeVideo;
    ensureHooks(v);
    if (v.muted || v.volume === 0) {
      v.__rsWantMuted = false;
      v.muted = false;
      if (v.volume === 0) v.volume = 1;
    } else {
      v.__rsWantMuted = true;
      v.muted = true;
    }
    updateUI(v);
  }

  // Instagram's own audio toggle — the small speaker button IG renders on the
  // reel (it shows through the .ig-slot gap at the end of our bar). Clicking
  // it (instead of muting the <video> directly) flips IG's global sound
  // state, so the next reels follow it too.
  function findIgAudioButton() {
    if (!activeVideo) return null;
    let root = activeVideo.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const svg = root.querySelector('svg[aria-label*="udio"]');
      if (svg) {
        const btn = svg.closest('button, [role="button"]');
        if (btn) return btn;
      }
      root = root.parentElement;
    }
    return null;
  }
  function toggleIgAudio() {
    if (activeVideo) activeVideo.__rsWantMuted = undefined;
    const btn = findIgAudioButton();
    if (btn) btn.click();
    else toggleMute();
  }

  // ---- Auto-next --------------------------------------------------------

  try {
    autoNext = localStorage.getItem("rsAutoNext") === "1";
  } catch (e) {}

  function renderAutoNext() {
    autoNextBtn.classList.toggle("on", autoNext);
    autoNextBtn.title = "Auto-next reel (a) — " + (autoNext ? "on" : "off");
  }
  renderAutoNext();

  function setAutoNext(on) {
    autoNext = on;
    try {
      localStorage.setItem("rsAutoNext", on ? "1" : "0");
    } catch (e) {}
    renderAutoNext();
  }

  // Exposed for the extension popup — we run in the page's MAIN world, so
  // the popup reaches these via chrome.scripting.executeScript({world:"MAIN"}).
  window.__reelSeekerGetAutoNext = function () {
    return autoNext;
  };
  window.__reelSeekerSetAutoNext = setAutoNext;

  function clickNextReel() {
    const el =
      document.querySelector('div[aria-label="Navigate to next reel"]') ||
      document.querySelector('[aria-label*="next reel" i][role="button"]');
    if (el) el.click();
  }

  // Reels loop, so "ended" rarely fires — also detect the time snapping from
  // the end back to the start.
  function maybeAutoNext(v) {
    const prev = v.__rsPrevT;
    v.__rsPrevT = v.currentTime;
    if (!autoNext || dragging) return;
    const dur = v.duration;
    if (!isFinite(dur) || dur <= 1) return;
    const cur = v.currentTime;
    const now = performance.now();
    if (now < autoNextSuppressUntil) return;
    const ended = v.ended || (!v.paused && cur >= dur - 0.05);
    const wrapped =
      !v.paused && prev != null && prev > dur - 0.35 && cur < 0.5;
    if (!ended && !wrapped) return;
    if (now - lastAutoAdvance < 1500) return; // one advance per reel
    lastAutoAdvance = now;
    clickNextReel();
  }

  playBtn.addEventListener("click", togglePlay);
  backBtn.addEventListener("click", function () {
    skip(-10);
  });
  fwdBtn.addEventListener("click", function () {
    skip(10);
  });
  speedBtn.addEventListener("click", cycleSpeed);
  autoNextBtn.addEventListener("click", function () {
    setAutoNext(!autoNext);
  });
  imgDl.addEventListener("click", function (e) {
    // Keep the click off Instagram — it would open/like the post.
    e.stopPropagation();
    e.preventDefault();
    triggerDownload();
  });
  imgDl.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
  });

  // Seek: click + drag on the track
  function seekToClientX(clientX) {
    if (!activeVideo || !isFinite(activeVideo.duration)) return;
    autoNextSuppressUntil = performance.now() + 800;
    const r = track.getBoundingClientRect();
    let ratio = (clientX - r.left) / r.width;
    ratio = Math.max(0, Math.min(1, ratio));
    fill.style.width = ratio * 100 + "%";
    thumb.style.left = ratio * 100 + "%";
    activeVideo.currentTime = ratio * activeVideo.duration;
  }

  track.addEventListener("pointerdown", function (e) {
    if (!activeVideo) return;
    dragging = true;
    bar.classList.add("dragging");
    track.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
    e.preventDefault();
    e.stopPropagation();
  });
  track.addEventListener("pointermove", function (e) {
    if (dragging) seekToClientX(e.clientX);
  });
  track.addEventListener("pointerup", function (e) {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove("dragging");
    try {
      track.releasePointerCapture(e.pointerId);
    } catch (err) {}
  });

  // Stop the bar's own clicks from bubbling to Instagram (which would
  // pause/like/navigate the reel).
  bar.addEventListener("click", function (e) {
    e.stopPropagation();
  });
  bar.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
  });
  bar.addEventListener("dblclick", function (e) {
    e.stopPropagation();
  });

  // Keyboard: , / . skip, k play/pause — only with an active video, not
  // while typing. Arrow keys are left to Instagram (prev/next navigation).
  document.addEventListener(
    "keydown",
    function (e) {
      if (!activeVideo) return;
      const t = e.target;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (typing) return;

      if (e.key === ",") {
        skip(-10);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === ".") {
        skip(10);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "k" || e.key === "K") {
        togglePlay();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "m" || e.key === "M") {
        toggleIgAudio();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "a" || e.key === "A") {
        setAutoNext(!autoNext);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "d" || e.key === "D") {
        triggerDownload();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
})();
