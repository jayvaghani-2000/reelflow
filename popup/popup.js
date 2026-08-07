/* Popup — mirrors the in-page settings.
 * The content script runs in the page's MAIN world, so we reach its exposed
 * window.__reelSeeker* hooks with chrome.scripting.executeScript({world:"MAIN"}).
 */
(async function () {
  "use strict";

  const hint = document.getElementById("hint");
  const toggles = {
    autoNext: document.getElementById("autonext"),
    downloads: document.getElementById("downloads")
  };
  const selects = {
    speed: document.getElementById("speed"),
    skip: document.getElementById("skip")
  };
  const allControls = [
    toggles.autoNext,
    toggles.downloads,
    selects.speed,
    selects.skip
  ];

  document
    .getElementById("openPanel")
    .addEventListener("click", async function () {
      try {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        window.close();
      } catch (e) {}
    });

  function showHint() {
    hint.classList.add("show");
    allControls.forEach(function (c) {
      c.disabled = true;
    });
  }

  let tabId = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return showHint();
    tabId = tab.id;

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: function () {
        return window.__reelSeekerGetSettings
          ? window.__reelSeekerGetSettings()
          : null;
      }
    });
    const s = res && res.result;
    if (!s) return showHint();

    toggles.autoNext.checked = !!s.autoNext;
    toggles.downloads.checked = !!s.downloads;
    selects.speed.value = String(s.speed);
    selects.skip.value = String(s.skip);
    allControls.forEach(function (c) {
      c.disabled = false;
    });
  } catch (e) {
    // Not an instagram.com tab (no host access) or page not ready.
    return showHint();
  }

  async function push(patch) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: "MAIN",
        func: function (p) {
          if (window.__reelSeekerSetSettings) window.__reelSeekerSetSettings(p);
        },
        args: [patch]
      });
    } catch (e) {
      showHint();
    }
  }

  toggles.autoNext.addEventListener("change", function () {
    push({ autoNext: toggles.autoNext.checked });
  });
  toggles.downloads.addEventListener("change", function () {
    push({ downloads: toggles.downloads.checked });
  });
  selects.speed.addEventListener("change", function () {
    push({ speed: parseFloat(selects.speed.value) });
  });
  selects.skip.addEventListener("change", function () {
    push({ skip: parseInt(selects.skip.value, 10) });
  });
})();
