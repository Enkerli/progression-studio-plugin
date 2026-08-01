#!/usr/bin/env node
// Build the Progression Studio web bundle and inline it into a single
// index.html for BinaryData embedding.
//
// Hard-won rules (enkerli-juce TESTING.md):
//  * WKWebView under JUCE's custom scheme doesn't run inline ES modules
//    → the bundle must be a classic script.
//  * Rollup's IIFE output reorders statements into temporal-dead-zone
//    crashes ("Cannot access 'X' before initialization") → convert
//    Vite's standard ES chunk with esbuild instead.
//  * Classic scripts aren't deferred → inline at the END of <body>.
//  * Never ship to a device untested: a happy-dom smoke render gates
//    this build (root must populate, zero errors).
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Where the monorepo app lives. The default used to be
// $HOME/Desktop/music-suite, which stopped existing when the checkouts were
// centralised under ~/Documents/Coding — so `node WebUI/build.mjs` silently
// pointed at nothing, and "regenerate after app changes" quietly did not
// (found 2026-07-30). Probe the same layouts the CMake side documents:
// an explicit argument, $MUSIC_SUITE, a sibling checkout, or this repo nested
// inside the monorepo. Fail loudly rather than build the wrong tree.
const appDir = (() => {
  const candidates = [
    process.argv[2],
    process.env.MUSIC_SUITE && join(process.env.MUSIC_SUITE, "apps/progression-studio"),
    resolve(import.meta.dirname, "../../music-suite/apps/progression-studio"),  // sibling
    resolve(import.meta.dirname, "../../../apps/progression-studio"),           // nested
  ].filter(Boolean).map((p) => resolve(p));
  const found = candidates.find((p) => existsSync(join(p, "package.json")));
  if (!found) {
    console.error("build.mjs: cannot find the progression-studio app. Tried:\n  " + candidates.join("\n  ")
      + "\nPass the path explicitly, or set MUSIC_SUITE.");
    process.exit(1);
  }
  return found;
})();
const monorepoModules = resolve(appDir, "../../node_modules");
console.log("building", appDir);
execSync(`npx vite build${process.env.PSP_DEBUG ? " --minify false" : ""}`, { cwd: appDir, stdio: "inherit" });

const dist = join(appDir, "dist");
let html = readFileSync(join(dist, "index.html"), "utf8");
const assets = join(dist, "assets");

const { build } = await import(join(monorepoModules, "esbuild/lib/main.js"));

for (const name of readdirSync(assets)) {
  if (name.endsWith(".js")) {
    const out = join(mkdtempSync(join(tmpdir(), "psp-")), "bundle.js");
    await build({
      entryPoints: [join(assets, name)],
      bundle: true,
      format: "iife",
      target: "safari16",
      minify: process.env.PSP_DEBUG ? false : true,
      outfile: out,
    });
    const safe = readFileSync(out, "utf8").replaceAll("</script", "<\\/script");
    html = html.replace(new RegExp(`<script[^>]*src="\\./assets/${name}"[^>]*></script>`), "");
    html = html.replace("</body>", () => `<script>${safe}</script></body>`);
  } else if (name.endsWith(".css")) {
    const content = readFileSync(join(assets, name), "utf8");
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${name}"[^>]*>`),
      () => `<style>${content}</style>`);
  }
}
if (html.includes("./assets/")) throw new Error("un-inlined asset reference remains");
if (/<script[^>]*type="module"/.test(html)) throw new Error("module script remains — WKWebView/custom-scheme hazard");

// Error overlay + console forwarding (a blank WebView must never be silent).
const prelude = `<script>
window.addEventListener("error", function (e) {
  var d = document.createElement("pre");
  d.style.cssText = "position:fixed;inset:8px;z-index:99999;background:#300;color:#fcc;padding:12px;overflow:auto;font:12px monospace;white-space:pre-wrap";
  d.textContent = "UI error: " + e.message + "\\n" + (e.filename || "") + ":" + (e.lineno || "") +
    (e.error && e.error.stack ? "\\n" + e.error.stack.slice(0, 600) : "");
  document.body ? document.body.appendChild(d) : addEventListener("DOMContentLoaded", function(){ document.body.appendChild(d); });
  try { window.__JUCE__ && window.__JUCE__.backend.emitEvent("log", { level: "error", msg: e.message }); } catch (_) {}
});
window.addEventListener("unhandledrejection", function (e) {
  try { window.__JUCE__ && window.__JUCE__.backend.emitEvent("log", { level: "error", msg: String(e.reason) }); } catch (_) {}
});
<\/script>`;
html = html.replace("<head>", "<head>" + prelude);


// Build tag + badge, so this bundle says when it was produced. The binary
// publishes its own stamp before the page loads (BridgedWebView's user script),
// and the two together are what make a mismatch visible: a bundle newer than the
// binary means it was rebuilt but never embedded and relinked, which is how a
// two-day-old Serpe UI shipped on 2026-07-29 with nothing on screen to say so.
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
html = html.replace("<head>", "<head>" + `<script>
window.__BUILD_TAG__ = ${JSON.stringify(stamp)};
(() => { const show = () => {
  if (!document.body || document.getElementById('es-build-tag')) return;
  const ui = window.__BUILD_TAG__, bin = window.__CPP_BUILD_TAG__;
  const stale = bin && bin !== 'unknown' && ui.slice(0,16) > bin.slice(0,16);
  const el = document.createElement('div'); el.id = 'es-build-tag';
  el.textContent = bin ? ('UI ' + ui + '  \u00b7  bin ' + bin + (stale ? '  \u26a0' : ''))
                       : ('UI ' + ui + '  \u00b7  bin \u2014');
  el.title = bin ? ('WebUI bundle built ' + ui + '\nBinary produced ' + bin
      + (stale ? '\n\nWARNING: the bundle is newer than the binary running it — rebuild and reinstall.' : ''))
    : ('WebUI bundle built ' + ui + ' \u2014 no native stamp (webapp, or an older plugin build)');
  el.style.cssText = 'position:fixed;right:6px;bottom:4px;z-index:2147483000;'
    + 'font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;'
    + 'color:var(--es-fg-muted,#8a8a8a);opacity:.55;pointer-events:none;'
    + 'user-select:none;font-variant-numeric:tabular-nums;';
  document.body.appendChild(el); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show(); })();
<\/script>`);

writeFileSync(join(process.cwd(), "WebUI/index.html"), html);
console.log("wrote WebUI/index.html", (html.length / 1024).toFixed(0) + " KB");

// ── Smoke gate: render the EXACT artifact in a real WKWebView (the same
// engine as iPadOS) before any device sees it. Found the App TDZ crash
// that unit tests can't reach (they never render).
//
// macOS-only: WKWebView (and `swift`) exist only on Apple platforms. On
// Linux there's no WKWebView to render into and `swift` isn't installed —
// running it there just dies with "swift: not found" (status 127) and
// blocks the whole build, so skip it. The gate still runs on every macOS
// build, which is where device artifacts are actually produced and shipped.
if (process.platform === "darwin") {
  const smoke = join(process.cwd(), "enkerli-juce/tools/webview-smoke.swift");
  execSync(`swift ${JSON.stringify(smoke)} WebUI/index.html`, { stdio: "inherit" });
} else {
  console.log("skipping WKWebView smoke gate (macOS-only) on", process.platform);
}
