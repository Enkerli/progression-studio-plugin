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
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const appDir = resolve(process.argv[2] ?? join(process.env.HOME, "Desktop/music-suite/apps/progression-studio"));
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


writeFileSync(join(process.cwd(), "WebUI/index.html"), html);
console.log("wrote WebUI/index.html", (html.length / 1024).toFixed(0) + " KB");

// ── Smoke gate: render the EXACT artifact in a real WKWebView (the same
// engine as iPadOS) before any device sees it. Found the App TDZ crash
// that unit tests can't reach (they never render).
const smoke = join(process.cwd(), "enkerli-juce/tools/webview-smoke.swift");
execSync(`swift ${JSON.stringify(smoke)} WebUI/index.html`, { stdio: "inherit" });
