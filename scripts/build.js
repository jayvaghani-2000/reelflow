/*
 * Build: copies the extension into dist/ with every .js file obfuscated,
 * then zips it as dist/reel-seeker.zip for distribution.
 *
 * NOTE: the Chrome Web Store forbids obfuscated code (minification is fine,
 * obfuscation is not) — this build is for direct/unpacked distribution only.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const JavaScriptObfuscator = require("javascript-obfuscator");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Everything the extension ships. JS is obfuscated, the rest copied verbatim.
const STATIC = ["manifest.json", "rules.json", "icons", "background.js"];
const APP_DIRS = ["content", "popup", "panel"];

// Conservative settings: content.js runs work every animation frame, so the
// expensive transforms (control-flow flattening, dead code) stay off.
// renameGlobals stays off so the window.__reelSeeker* hooks keep working.
const OBFUSCATOR_OPTIONS = {
  compact: true,
  simplify: true,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ["base64"],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  disableConsoleOutput: false
};

// popup.js injects functions into the page with chrome.scripting.executeScript
// ({func}) — that serializes ONLY the function, so it must not reference the
// file-level string-array decoder the obfuscator would otherwise add. Keep
// popup.js to identifier renaming only.
const PER_FILE_OPTIONS = {
  "popup/popup.js": {
    stringArray: false,
    stringArrayEncoding: [],
    splitStrings: false
  }
};

function optionsFor(rel) {
  return Object.assign({}, OBFUSCATOR_OPTIONS, PER_FILE_OPTIONS[rel] || {});
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(function (name) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (src.endsWith(".js")) {
    const rel = path.relative(ROOT, src).split(path.sep).join("/");
    const code = fs.readFileSync(src, "utf8");
    const out = JavaScriptObfuscator.obfuscate(code, optionsFor(rel));
    fs.writeFileSync(dest, out.getObfuscatedCode());
    console.log("obfuscated  " + rel);
  } else {
    fs.copyFileSync(src, dest);
    console.log("copied      " + path.relative(ROOT, src));
  }
}

// Clean dist
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

STATIC.concat(APP_DIRS).forEach(function (entry) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) return; // e.g. background.js only exists sometimes
  copyRecursive(src, path.join(DIST, entry));
});

// Zip for distribution (best effort — dist/ alone is loadable unpacked).
try {
  execSync("zip -qr reel-seeker.zip . -x reel-seeker.zip", { cwd: DIST });
  console.log("\nzip         dist/reel-seeker.zip");
} catch (e) {
  console.log("\n(zip not created: " + e.message.split("\n")[0] + ")");
}

console.log("\nBuild done → " + path.relative(ROOT, DIST));
console.log(
  "Reminder: obfuscated builds are for direct distribution only — the Chrome Web Store rejects obfuscated code."
);
