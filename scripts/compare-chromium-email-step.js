"use strict";

const fs = require("fs");
const path = require("path");
const playwright = require("playwright");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const EMAIL = process.argv[2] || "blockheaton@gmail.com";
const PROFILE_BASE_DIR = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.resolve("artifacts/chromium-stealth-profiles");
const RUN_DIR = path.resolve(
  "artifacts",
  `chromium-email-step-${new Date().toISOString().replace(/[:.]/g, "-")}`
);

const CASES = [
  { id: "chromium-no-stealth", stealth: false, profileDir: path.join(PROFILE_BASE_DIR, "chromium-no-stealth") },
  { id: "chromium-stealth", stealth: true, profileDir: path.join(PROFILE_BASE_DIR, "chromium-stealth") }
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

async function waitForPasswordStep(googlePage, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = googlePage.url();
    const passwordVisible = await googlePage.locator('input[type="password"]').first().isVisible().catch(() => false);
    const passwordTextVisible = await googlePage.getByText(/enter your password|输入您的密码|welcome/i).first().isVisible().catch(() => false);
    if (passwordVisible || passwordTextVisible || /challenge\/pwd|challenge\/password/i.test(url)) {
      return {
        reached: true,
        url,
        passwordVisible,
        passwordTextVisible
      };
    }
    await googlePage.waitForTimeout(500);
  }
  return {
    reached: false,
    url: googlePage.url(),
    passwordVisible: false,
    passwordTextVisible: false
  };
}

async function runCase(testCase) {
  const caseDir = path.join(RUN_DIR, testCase.id);
  ensureDir(caseDir);
  ensureDir(testCase.profileDir);

  const result = {
    id: testCase.id,
    stealth: testCase.stealth,
    profile: testCase.profileDir,
    email: EMAIL
  };

  let context;
  try {
    const browserType = browserTypeForCase(testCase);
    context = await browserType.launchPersistentContext(testCase.profileDir, {
      headless: false,
      viewport: { width: 1440, height: 960 }
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(15000);

    const googleFrame = await findGoogleFrame(page, 10000);
    result.googleFrameFound = !!googleFrame;
    if (!googleFrame)
      throw new Error("google sign-in iframe not found");

    const googleButton = googleFrame.getByRole("button", { name: /google/i }).first();
    result.googleButtonVisible = await googleButton.isVisible().catch(() => false);

    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
      googleButton.click()
    ]);

    await page.waitForTimeout(5000);
    const pages = context.pages();
    const googlePage = popup || pages.find((candidate) => /accounts\.google\.com/i.test(candidate.url()) && !/gsi\/button/i.test(candidate.url()));
    result.googlePopupFound = !!googlePage;
    result.pageUrls = pages.map((candidate) => candidate.url());

    if (!googlePage)
      throw new Error("google popup page not found");

    await googlePage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    const identifier = googlePage.locator('input[type="email"], input[name="identifier"]').first();
    result.identifierVisibleBeforeFill = await identifier.isVisible().catch(() => false);
    if (!result.identifierVisibleBeforeFill)
      throw new Error("google email input not visible");

    await identifier.fill(EMAIL);
    result.emailValueAfterFill = await identifier.inputValue().catch(() => "");

    const nextButton = googlePage.getByRole("button", { name: /next|下一步/i }).first();
    result.nextButtonVisible = await nextButton.isVisible().catch(() => false);
    if (!result.nextButtonVisible)
      throw new Error("google next button not visible");

    await Promise.all([
      googlePage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {}),
      nextButton.click()
    ]);
    await googlePage.waitForTimeout(5000);

    const passwordStep = await waitForPasswordStep(googlePage, 20000);
    result.reachedPasswordStep = passwordStep.reached;
    result.passwordPageUrl = passwordStep.url;
    result.passwordInputVisible = passwordStep.passwordVisible;
    result.passwordTextVisible = passwordStep.passwordTextVisible;

    await page.screenshot({ path: path.join(caseDir, "x-login.png"), fullPage: true }).catch(() => {});
    await googlePage.screenshot({ path: path.join(caseDir, "google-after-email.png"), fullPage: true }).catch(() => {});
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
  const results = [];
  for (const testCase of CASES) {
    console.log(`running ${testCase.id}`);
    const result = await runCase(testCase);
    results.push(result);
    console.log(JSON.stringify({
      id: result.id,
      googlePopupFound: result.googlePopupFound,
      emailValueAfterFill: result.emailValueAfterFill,
      reachedPasswordStep: result.reachedPasswordStep,
      passwordPageUrl: result.passwordPageUrl || null,
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
