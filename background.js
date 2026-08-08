chrome.runtime.onInstalled.addListener(function (details) {
  // First install only — not on extension updates or Chrome restarts.
  if (details.reason === "install") {
    chrome.tabs.create({
      url: "http://universalcalculators.net/plugin/reelflow"
    });
  }
});
