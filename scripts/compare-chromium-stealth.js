"use strict";

const fs = require("fs");
const path = require("path");
const playwright = require("playwright");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const BASE_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts/chromium-stealth-profiles");

const RUN_DIR = path.resolve(
  "artifacts",
  `chromium-stealth-${new Date().toISOString().replace(/[:.]/g, "-")}`
);

const CASES = [
  { id: "chromium-no-stealth", stealth: false },
  { id: "chromium-stealth", stealth: true }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function browserTypeForCase(testCase) {
  if (!testCase.stealth)
    return playwright.chromium;
  const wrapped = addExtra(playwright.chromium);
  wrapped.use(StealthPlugin());
  return wrapped;
}

async function collectFingerprint(page) {
  return page.evaluate(() => ({
    webdriver: navigator.webdriver,
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages,
    platform: navigator.platform,
    pluginsLength: navigator.plugins.length,
    hasChromeRuntime: !!globalThis.chrome?.runtime,
    hasChromeObject: !!globalThis.chrome
  }));
}

async function findGoogleFrame(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => /accounts\.google\.com\/gsi\/button/i.test(candidate.url()));
    if (frame)
      return frame;
    await page.waitForTimeout(500);
  }
  return null;
}

async function runCase(testCase) {
  const caseDir = path.join(RUN_DIR, testCase.id);
  const profileDir = path.join(BASE_DIR, testCase.id);
  ensureDir(caseDir);
  ensureDir(profileDir);

  const result = {
    id: testCase.id,
    stealth: testCase.stealth,
    profile: profileDir
  };

  let context;
  try {
    const browserType = browserTypeForCase(testCase);
    context = await browserType.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1440, height: 960 }
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(15000);

    result.title = await page.title();
    result.url = page.url();
    result.fingerprint = await collectFingerprint(page);
    result.bodyText = await page.locator("body").innerText().catch(() => "");
    result.errorPage = /出错了|something went wrong/i.test(result.bodyText);
    result.frameUrls = page.frames().map((frame) => frame.url()).filter(Boolean);

    const googleFrame = await findGoogleFrame(page, 10000);
    result.googleFrameFound = !!googleFrame;

    if (googleFrame) {
      const googleButton = googleFrame.getByRole("button", { name: /google/i }).first();
      result.googleButtonVisible = await googleButton.isVisible().catch(() => false);
      const [popup] = await Promise.all([
        page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
        googleButton.click()
      ]);

      await page.waitForTimeout(5000);
      const pages = context.pages();
      const googlePage = popup || pages.find((candidate) => /accounts\.google\.com/i.test(candidate.url()) && !/gsi\/button/i.test(candidate.url()));
      result.popupOpened = !!popup;
      result.contextPageCount = pages.length;
      result.pageUrls = pages.map((candidate) => candidate.url());
      result.googlePageFound = !!googlePage;

      if (googlePage) {
        await googlePage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        result.googlePageUrl = googlePage.url();
        result.googleIdentifierVisible = await googlePage
          .locator('input[type="email"], input[name="identifier"]')
          .first()
          .isVisible()
          .catch(() => false);
      }
    }

    await page.screenshot({ path: path.join(caseDir, "x-login.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(caseDir, "result.json"), JSON.stringify(result, null, 2), "utf8");
    return result;
  } catch (error) {
    result.error = error.message;
    fs.writeFileSync(path.join(caseDir, "result.json"), JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    if (context)
      await context.close().catch(() => {});
  }
}

async function main() {
  ensureDir(RUN_DIR);
  ensureDir(BASE_DIR);
  const results = [];

  for (const testCase of CASES) {
    console.log(`running ${testCase.id}`);
    const result = await runCase(testCase);
    results.push(result);
    console.log(JSON.stringify({
      id: result.id,
      webdriver: result.fingerprint?.webdriver,
      errorPage: result.errorPage,
      googleFrameFound: result.googleFrameFound,
      popupOpened: result.popupOpened,
      googleIdentifierVisible: result.googleIdentifierVisible,
      error: result.error || null
    }));
  }

  fs.writeFileSync(path.join(RUN_DIR, "summary.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`runDir=${RUN_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
