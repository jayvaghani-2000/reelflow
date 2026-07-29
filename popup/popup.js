/* Popup — mirrors the in-page auto-next toggle.
 * The content script runs in the page's MAIN world, so we reach its exposed
 * window.__reelSeeker* hooks with chrome.scripting.executeScript({world:"MAIN"}).
 */
(async function () {
  "use strict";

  const toggle = document.getElementById("autonext");
  const hint = document.getElementById("hint");

  function showHint() {
    hint.classList.add("show");
    toggle.disabled = true;
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
        return window.__reelSeekerGetAutoNext
          ? { ok: true, on: window.__reelSeekerGetAutoNext() }
          : { ok: false };
      }
    });
    if (!res || !res.result || !res.result.ok) return showHint();

    toggle.checked = res.result.on;
    toggle.disabled = false;
  } catch (e) {
    // Not an instagram.com tab (no host access) or page not ready.
    return showHint();
  }

  toggle.addEventListener("change", async function () {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: "MAIN",
        func: function (on) {
          if (window.__reelSeekerSetAutoNext) window.__reelSeekerSetAutoNext(on);
        },
        args: [toggle.checked]
      });
    } catch (e) {
      showHint();
    }
  });
})();
