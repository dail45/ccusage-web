#!/usr/bin/env node
// Run with: node scripts/capture-screenshots.mjs
import { chromium } from "playwright";
import { mkdir } from "fs/promises";

const BASE = process.env.SCREENSHOT_URL ?? "http://localhost:3000";
const OUT = "docs";

await mkdir(OUT, { recursive: true });

async function launchBrowser() {
  for (const opts of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    try {
      return await chromium.launch(opts);
    } catch {
      // try next installed browser channel
    }
  }
  return chromium.launch();
}

async function waitForDataLoaded(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-slot="skeleton"]') &&
      Boolean(document.querySelector("table") || document.body.innerText.includes("No ")),
    { timeout: 60000 }
  );
  await page.waitForTimeout(1000);
}

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewportSize({ width: 1360, height: 920 });

// Ensure dark theme and clean defaults before loading
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.removeItem("ccusage-web:preferences");
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('button:has-text("7D")', { timeout: 60000 });
await waitForDataLoaded(page);

// 1. Daily view (7D range)
console.log("Capturing Daily (7D)…");
await page.click('button:has-text("7D")');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/screenshot-daily.png`, fullPage: true });
console.log(`  → ${OUT}/screenshot-daily.png`);

// 2. Model filter popover (scrolled so Cost/Tokens by Model sit near top-middle and popover opens downward)
console.log("Capturing Model Filter…");
await page.evaluate(() => {
  const heading = Array.from(document.querySelectorAll("div, h2, h3")).find(
    (el) => el.textContent?.trim() === "Tokens by Model"
  );
  if (heading) {
    const top = heading.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo(0, Math.max(0, top));
  }
});
await page.waitForTimeout(300);
await page.click('button[aria-haspopup="dialog"]:has-text("Models")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/screenshot-model-filter.png`, fullPage: false });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
console.log(`  → ${OUT}/screenshot-model-filter.png`);

// 3. Monthly view
console.log("Capturing Monthly…");
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('[role="tab"]:has-text("Monthly")');
await waitForDataLoaded(page);
await page.screenshot({ path: `${OUT}/screenshot-monthly.png`, fullPage: true });
console.log(`  → ${OUT}/screenshot-monthly.png`);

// 4. Sessions view (7D for richer session history)
console.log("Capturing Sessions…");
await page.click('[role="tab"]:has-text("Sessions")');
await waitForDataLoaded(page);
const sess7d = page.locator('button:has-text("7D")').first();
if (await sess7d.isVisible()) {
  await sess7d.click();
  await page.waitForTimeout(600);
}
await page.screenshot({ path: `${OUT}/screenshot-sessions.png`, fullPage: true });
console.log(`  → ${OUT}/screenshot-sessions.png`);

// 5. Blocks view
console.log("Capturing Blocks…");
await page.click('[role="tab"]:has-text("Blocks")');
await waitForDataLoaded(page);
await page.screenshot({ path: `${OUT}/screenshot-blocks.png`, fullPage: true });
console.log(`  → ${OUT}/screenshot-blocks.png`);

// 6. Settings view (wait for version info & ccusage.json config to finish loading)
console.log("Capturing Settings…");
await page.click('button:has-text("Settings")');
await page.waitForFunction(
  () => !document.body.innerText.includes("Loading ccusage configuration"),
  { timeout: 30000 }
);
if (await page.locator("text=/Unavailable/").count() > 0) {
  await page.click('button:has-text("Check for updates")');
  await page.waitForFunction(
    () => !document.body.innerText.includes("Checking GitHub Releases") && !document.body.innerText.includes("Unavailable"),
    { timeout: 15000 }
  ).catch(() => {});
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/screenshot-settings.png`, fullPage: false });
console.log(`  → ${OUT}/screenshot-settings.png`);

await browser.close();
console.log("\nAll screenshots saved.");
