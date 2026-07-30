(function () {
  "use strict";

  const MIN_WIDTH = 770;
  // Wait for a drag to settle before re-booting the frame, so dragging across
  // the threshold reloads once rather than on every resize event.
  const RELOAD_SETTLE_MS = 400;

  const frame = document.getElementById("ig");
  const widthEl = document.getElementById("width");
  const tip = document.getElementById("tip");
  const urlEl = document.getElementById("url");

  // ---- Address bar ------------------------------------------------------
  // The frame is cross-origin, so its location is unreadable from here. The
  // content script inside it posts the URL out on every change instead.
  // The frame's live URL. Kept because `frame.src` only ever holds the value
  // we last assigned — it does not follow navigations inside the frame.
  let currentHref = frame.src;

  function setUrl(href) {
    currentHref = href;
    urlEl.title = href;
    try {
      const u = new URL(href);
      // Drop the scheme and "www." the way a browser's omnibox does; keep the
      // path, which is the part that identifies the reel.
      urlEl.textContent = u.host.replace(/^www\./, "") + u.pathname + u.search;
    } catch (e) {
      urlEl.textContent = href;
    }
  }
  setUrl(frame.src);

  // Re-boots already requested, keyed by URL, so a page whose layout never
  // recovers is reloaded once rather than endlessly.
  let reloadedFor = "";

  window.addEventListener("message", function (e) {
    if (!/^https?:\/\/([a-z0-9-]+\.)*instagram\.com$/.test(e.origin)) return;
    const d = e.data;
    if (!d || typeof d.href !== "string") return;

    if (d.__reelSeeker === "url") {
      setUrl(d.href);
      return;
    }

    // The frame reports a reel page rendering without Instagram's next-reel
    // arrows — the stuck mobile layout. Only a fresh document load fixes it.
    if (d.__reelSeeker === "needsReload") {
      // Below the threshold Instagram genuinely won't draw them, so a reload
      // would change nothing.
      if (window.innerWidth < MIN_WIDTH) return;
      if (reloadedFor === d.href) return;
      reloadedFor = d.href;
      setUrl(d.href);
      reloadFrame();
    }
  });

  // ---- Reload / re-boot -------------------------------------------------
  // Instagram chooses its layout from the viewport at document load and keeps
  // that choice for the rest of the SPA session. A frame booted while the
  // panel was narrow therefore stays in the mobile layout — no next-reel
  // arrows — however wide you drag the panel afterwards, because in-app
  // navigation never re-requests the document. Only a real load re-measures.
  let bootedNarrow = window.innerWidth < MIN_WIDTH;
  let settleTimer = null;

  function reloadFrame() {
    // Assign the tracked URL, not `frame.src`: the attribute still holds the
    // original home URL, so reusing it would throw away the reel you're on.
    // Re-setting src always navigates, even to the identical URL.
    frame.src = currentHref;
    bootedNarrow = window.innerWidth < MIN_WIDTH;
  }

  document.getElementById("reload").addEventListener("click", function () {
    // Re-set src rather than contentWindow.reload() — the frame is
    // cross-origin, so we can't touch its window.
    reloadFrame();
  });

  function updateWidth() {
    const w = window.innerWidth;
    widthEl.textContent = w + "px";
    widthEl.classList.toggle("narrow", w < MIN_WIDTH);
    tip.classList.toggle("show", w < MIN_WIDTH);

    // Crossed into the full-layout range with a frame that booted narrow —
    // re-boot it so Instagram re-measures and renders the desktop layout.
    if (!bootedNarrow || w < MIN_WIDTH) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(reloadFrame, RELOAD_SETTLE_MS);
  }
  window.addEventListener("resize", updateWidth);
  updateWidth();
})();
