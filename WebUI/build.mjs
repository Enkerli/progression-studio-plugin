#!/usr/bin/env node
// Build the Progression Studio web bundle and inline it into a single
// index.html for BinaryData embedding (the Vane single-file pattern).
// Usage: node WebUI/build.mjs [path-to-monorepo-app]
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const appDir = resolve(process.argv[2] ?? join(process.env.HOME, "Desktop/music-suite/apps/progression-studio"));
console.log("building", appDir);
execSync("npx vite build", { cwd: appDir, stdio: "inherit" });

const dist = join(appDir, "dist");
let html = readFileSync(join(dist, "index.html"), "utf8");
const assets = join(dist, "assets");
for (const name of readdirSync(assets)) {
  const content = readFileSync(join(assets, name), "utf8");
  if (name.endsWith(".js")) {
    // Guard inline scripts against premature termination.
    const safe = content.replaceAll("</script", "<\\/script");
    html = html.replace(new RegExp(`<script[^>]*src="\\./assets/${name}"[^>]*></script>`),
      () => `<script type="module">${safe}</script>`);
  } else if (name.endsWith(".css")) {
    html = html.replace(new RegExp(`<link[^>]*href="\\./assets/${name}"[^>]*>`),
      () => `<style>${content}</style>`);
  }
}
if (html.includes("./assets/")) throw new Error("un-inlined asset reference remains");
writeFileSync(join(process.cwd(), "WebUI/index.html"), html);
console.log("wrote WebUI/index.html", (html.length / 1024).toFixed(0) + " KB");
