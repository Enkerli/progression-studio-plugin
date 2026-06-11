#!/usr/bin/env node
// Build the Progression Studio web bundle and inline it into a single
// index.html for BinaryData embedding (the Vane single-file pattern).
// Usage: node WebUI/build.mjs [path-to-monorepo-app]
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const appDir = resolve(process.argv[2] ?? join(process.env.HOME, "Desktop/music-suite/apps/progression-studio"));
console.log("building", appDir);
execSync("npx vite build", { cwd: appDir, stdio: "inherit", env: { ...process.env, PSP_SINGLEFILE: "1" } });

const dist = join(appDir, "dist");
let html = readFileSync(join(dist, "index.html"), "utf8");
const assets = join(dist, "assets");
for (const name of readdirSync(assets)) {
  const content = readFileSync(join(assets, name), "utf8");
  if (name.endsWith(".js")) {
    // Guard inline scripts against premature termination. Classic script
    // (IIFE build) — inline ES modules don't run under JUCE's custom
    // scheme in WKWebView. Unlike module scripts, classic inline scripts
    // are NOT deferred, so the script must live at the END of <body> or
    // it runs before #root exists (React error #299, found on-device).
    const safe = content.replaceAll("</script", "<\\/script");
    html = html.replace(new RegExp(`<script[^>]*src="\\./assets/${name}"[^>]*></script>`), "");
    html = html.replace("</body>", () => `<script>${safe}</script></body>`);
  } else if (name.endsWith(".css")) {
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${name}"[^>]*>`),
      () => `<style>${content}</style>`);
  }
}
if (html.includes("./assets/")) throw new Error("un-inlined asset reference remains");
if (/<script[^>]*type="module"/.test(html)) throw new Error("module script remains — WKWebView/custom-scheme hazard");

// On-device debuggability: a blank WebView must never be silent. This
// prelude paints any uncaught error onto the page and forwards console
// errors to the C++ side (JUCE 'log' event) when bridged.
const prelude = `<script>
window.addEventListener("error", function (e) {
  var d = document.createElement("pre");
  d.style.cssText = "position:fixed;inset:8px;z-index:99999;background:#300;color:#fcc;padding:12px;overflow:auto;font:12px monospace;white-space:pre-wrap";
  d.textContent = "UI error: " + e.message + "\\n" + (e.filename || "") + ":" + (e.lineno || "");
  document.body ? document.body.appendChild(d) : addEventListener("DOMContentLoaded", function(){ document.body.appendChild(d); });
  try { window.__JUCE__ && window.__JUCE__.backend.emitEvent("log", { level: "error", msg: e.message }); } catch (_) {}
});
window.addEventListener("unhandledrejection", function (e) {
  try { window.__JUCE__ && window.__JUCE__.backend.emitEvent("log", { level: "error", msg: String(e.reason) }); } catch (_) {}
});
<\/script>`;
html = html.replace("<head>", "<head>" + prelude);
writeFileSync(join(process.cwd(), "WebUI/index.html"), html);
console.log("wrote WebUI/index.html", (html.length / 1024).toFixed(0) + " KB");
