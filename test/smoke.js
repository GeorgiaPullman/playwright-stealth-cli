"use strict";

const assert = require("assert");
const { normalizeArgv, parseOpenConfig } = require("../lib/cli-wrapper");
const { execFileSync } = require("child_process");

const defaultArgv = [
  "node",
  "cli.js",
  "open"
];
const defaultConfig = parseOpenConfig(defaultArgv);
assert.equal(defaultConfig.stealthEnabled, true);
assert.equal(defaultConfig.useTemporaryProfile, true);
assert.ok(defaultConfig.profileDir.includes("playwright-cli-profile-"));
assert.equal(normalizeArgv(defaultArgv, defaultConfig).includes("--profile"), true);
assert.equal(normalizeArgv(defaultArgv, defaultConfig).includes("--persistent"), true);
assert.equal(normalizeArgv(defaultArgv, defaultConfig).includes("--browser"), true);

const profileArgv = [
  "node",
  "cli.js",
  "open",
  "--profile-dir",
  "./profiles/demo",
  "--disable-stealth"
];
const profileConfig = parseOpenConfig(profileArgv);

assert.equal(profileConfig.stealthEnabled, false);
assert.equal(profileConfig.profileDir.endsWith("/profiles/demo"), true);

const normalizedProfileArgv = normalizeArgv(profileArgv, profileConfig);
assert.deepEqual(normalizedProfileArgv.slice(0, 7), [
  "node",
  "cli.js",
  "open",
  "--profile",
  "./profiles/demo",
  "--browser",
  "chromium"
]);
assert.equal(normalizedProfileArgv.includes("--persistent"), true);

const extensionArgv = [
  "node",
  "cli.js",
  "open",
  "--extension-path",
  "./extensions/a",
  "--extension-path=./extensions/b"
];
const extensionConfig = parseOpenConfig(extensionArgv);

assert.equal(extensionConfig.stealthEnabled, true);
assert.equal(extensionConfig.extensionPaths.length, 2);
assert.ok(extensionConfig.profileDir.includes("playwright-cli-profile-"));

const normalizedExtensionArgv = normalizeArgv(extensionArgv, extensionConfig);
assert.equal(normalizedExtensionArgv.includes("--profile"), true);

const temporaryArgv = [
  "node",
  "cli.js",
  "open",
  "--temp-profile"
];
const temporaryConfig = parseOpenConfig(temporaryArgv);
assert.equal(temporaryConfig.useTemporaryProfile, true);
assert.ok(temporaryConfig.profileDir.includes("playwright-cli-profile-"));

const chromeArgv = [
  "node",
  "cli.js",
  "open",
  "--channel",
  "chrome"
];
const chromeConfig = parseOpenConfig(chromeArgv);
assert.equal(chromeConfig.browser, "chrome");
assert.ok(chromeConfig.profileDir.includes("playwright-cli-profile-"));
assert.equal(normalizeArgv(chromeArgv, chromeConfig).includes("--profile"), true);

const rootHelp = execFileSync("node", ["./cli.js", "--help"], { cwd: __dirname + "/..", encoding: "utf8" });
assert.ok(rootHelp.includes("profile-list"));
assert.ok(rootHelp.includes("goto <url>"));

const openHelp = execFileSync("node", ["./cli.js", "open", "--help"], { cwd: __dirname + "/..", encoding: "utf8" });
assert.ok(openHelp.includes("--disable-stealth"));
assert.ok(openHelp.includes("--extension-path <dir>"));

console.log("smoke ok");
