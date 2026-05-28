#!/usr/bin/env node
/**
 * UI smoke test — boots the real Vite dev server in this sandbox, opens
 * the React app in headless Chromium (via Playwright), checks that the
 * landing page renders without runtime errors, and saves a screenshot.
 *
 * Catches the kind of regressions that unit tests can't see: broken
 * imports, runtime errors, missing routes, blank pages. Runs in ~10s.
 *
 * Usage:
 *   node scripts/ui-smoke.cjs
 *
 * Requirements:
 *   - bun (for the dev server)
 *   - playwright + chromium (preinstalled in the dev sandbox at
 *     /opt/node22/lib/node_modules/playwright). Skip gracefully if absent.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const PLAYWRIGHT_PATH = "/opt/node22/lib/node_modules/playwright";
const VITE_PORT = 5173;
const VITE_URL = `http://127.0.0.1:${VITE_PORT}`;
const SHOT_DIR = path.join(__dirname, "..", "tmp-ui-smoke");

if (!fs.existsSync(PLAYWRIGHT_PATH)) {
  console.error("[ui-smoke] playwright not found at " + PLAYWRIGHT_PATH);
  console.error("[ui-smoke] skipping (run locally with `npm i -D playwright && playwright install chromium`)");
  process.exit(0);
}

const { chromium } = require(PLAYWRIGHT_PATH);

function waitForUrl(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        if (res.statusCode && res.statusCode < 500) return resolve();
        if (Date.now() > deadline) return reject(new Error("HTTP " + res.statusCode));
        setTimeout(tick, 300);
      });
      req.on("error", () => {
        if (Date.now() > deadline) return reject(new Error("timeout"));
        setTimeout(tick, 300);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tick();
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  console.log("[ui-smoke] starting vite dev server on " + VITE_URL);
  const vite = spawn("bun", ["x", "vite", "--port", String(VITE_PORT), "--host", "127.0.0.1"], {
    cwd: path.join(__dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", (b) => process.stdout.write("[vite] " + b));
  vite.stderr.on("data", (b) => process.stderr.write("[vite] " + b));

  try {
    await waitForUrl(VITE_URL, 30_000);
  } catch (e) {
    console.error("[ui-smoke] vite never came up:", e.message);
    vite.kill("SIGKILL");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push("console: " + m.text());
  });

  let failed = false;
  try {
    console.log("[ui-smoke] loading landing page");
    await page.goto(VITE_URL, { timeout: 15_000, waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    const title = await page.title();
    if (!/Legal AI/i.test(title)) {
      console.error("[ui-smoke] unexpected title:", title);
      failed = true;
    }

    // Landing page should have the hero headline + a CTA button
    const heroPresent = (await page.locator("text=KI für Anwälte").count()) > 0;
    const ctaPresent = (await page.locator("text=Kostenlos starten").count()) > 0;
    if (!heroPresent) { console.error("[ui-smoke] hero text missing"); failed = true; }
    if (!ctaPresent) { console.error("[ui-smoke] CTA missing"); failed = true; }

    const landingShot = path.join(SHOT_DIR, "landing.png");
    await page.screenshot({ path: landingShot, fullPage: false });
    console.log("[ui-smoke] saved " + path.relative(process.cwd(), landingShot));

    // Try a sub-route that shouldn't crash even unauthenticated
    await page.goto(VITE_URL + "/auth", { timeout: 15_000, waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const authShot = path.join(SHOT_DIR, "auth.png");
    await page.screenshot({ path: authShot, fullPage: false });
    console.log("[ui-smoke] saved " + path.relative(process.cwd(), authShot));

    if (consoleErrors.length > 0) {
      // Some console errors are noise (3rd-party scripts, optional integrations).
      // Filter to errors the app itself emitted.
      const appErrors = consoleErrors.filter(e =>
        !/gpt-engineer|sourcemap|adblock|chrome-extension|workbox|tracking|favicon/i.test(e)
      );
      if (appErrors.length > 0) {
        console.error("[ui-smoke] runtime errors detected:");
        for (const e of appErrors) console.error("  " + e.slice(0, 300));
        failed = true;
      } else {
        console.log("[ui-smoke] " + consoleErrors.length + " noise-level console errors (ignored)");
      }
    }
  } catch (e) {
    console.error("[ui-smoke] FATAL during page interaction:", e.message);
    failed = true;
  }

  await browser.close();
  vite.kill("SIGKILL");

  if (failed) {
    console.error("[ui-smoke] FAILED");
    process.exit(1);
  }
  console.log("[ui-smoke] PASSED");
})();
