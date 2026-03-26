"use strict";

const fs = require("fs");
const path = require("path");
const { patchPlaywright } = require("../lib/cli-wrapper");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slug(value) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function saveSnapshot(page, outputDir, name) {
  const fileBase = slug(name);
  const screenshotPath = path.join(outputDir, `${fileBase}.png`);
  const htmlPath = path.join(outputDir, `${fileBase}.html`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    console.error(`screenshot failed for ${name}: ${error.message}`);
  }

  try {
    fs.writeFileSync(htmlPath, await page.content(), "utf8");
  } catch (error) {
    console.error(`html dump failed for ${name}: ${error.message}`);
  }
}

async function findGoogleButton(page) {
  const candidates = [
    page.getByRole("button", { name: /sign in with google/i }),
    page.getByRole("link", { name: /sign in with google/i }),
    page.getByText(/sign in with google/i)
  ];

  for (const locator of candidates) {
    if (await locator.first().isVisible().catch(() => false))
      return locator.first();
  }

  return null;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.resolve("artifacts", `x-google-${timestamp}`);
  const profileDir = path.join(runDir, "profile");
  const outputDir = path.join(runDir, "output");
  ensureDir(profileDir);
  ensureDir(outputDir);

  patchPlaywright({ stealthEnabled: true, extensionPaths: [] });
  const playwright = require("playwright");

  const eventLog = [];
  const log = (message) => {
    eventLog.push(message);
    console.log(message);
  };

  const context = await playwright.chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 960 }
  });

  context.on("page", (newPage) => {
    log(`[context page] ${newPage.url() || "about:blank"}`);
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    page.on("popup", (popup) => log(`[popup event] ${popup.url() || "about:blank"}`));
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame())
        log(`[frame] ${frame.url()}`);
    });

    log(`runDir=${runDir}`);
    log(`profileDir=${profileDir}`);

    await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await saveSnapshot(page, outputDir, "x-login-initial");

    const googleButton = await findGoogleButton(page);
    if (!googleButton)
      throw new Error('Could not find "Sign in with Google" entry on X login page');

    const [maybePopup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
      googleButton.click()
    ]);

    await page.waitForTimeout(5000);

    const allPages = context.pages();
    log(`context page count=${allPages.length}`);

    for (let i = 0; i < allPages.length; i++) {
      const p = allPages[i];
      await p.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
      log(`[page ${i}] ${p.url()}`);
      await saveSnapshot(p, outputDir, `page-${i}`);
    }

    const currentFrames = page.frames().map((frame) => frame.url()).filter(Boolean);
    for (const frameUrl of currentFrames)
      log(`[frame snapshot] ${frameUrl}`);

    const googlePage = maybePopup || allPages.find((p) => /accounts\.google\.com/i.test(p.url()));
    if (!googlePage) {
      log("No Google popup/page detected after click.");
    } else {
      await googlePage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await saveSnapshot(googlePage, outputDir, "google-login");
      log(`googlePage=${googlePage.url()}`);

      const emailFieldVisible =
        await googlePage.locator('input[type="email"]').first().isVisible().catch(() => false);
      const identifierFieldVisible =
        await googlePage.locator('input[name="identifier"]').first().isVisible().catch(() => false);
      const signInHeadingVisible =
        await googlePage.getByText(/sign in/i).first().isVisible().catch(() => false);

      log(`google email field visible=${emailFieldVisible}`);
      log(`google identifier field visible=${identifierFieldVisible}`);
      log(`google sign-in text visible=${signInHeadingVisible}`);
    }

    fs.writeFileSync(path.join(outputDir, "event-log.txt"), `${eventLog.join("\n")}\n`, "utf8");
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
