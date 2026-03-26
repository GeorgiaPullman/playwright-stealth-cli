"use strict";

const assert = require("assert");
const { normalizeArgv, parseCustomConfig } = require("../lib/cli-wrapper");
const { execFileSync } = require("child_process");

const defaultArgv = [
  "node",
  "cli.js",
  "open"
];
const defaultConfig = parseCustomConfig(defaultArgv);
assert.equal(defaultConfig.stealthEnabled, true);
assert.equal(defaultConfig.useTemporaryProfile, true);
assert.ok(defaultConfig.profileDir.includes("playwright-cli-profile-"));
assert.equal(normalizeArgv(defaultArgv, defaultConfig).includes("--user-data-dir"), true);

const profileArgv = [
  "node",
  "cli.js",
  "open",
  "--profile-dir",
  "./profiles/demo",
  "--disable-stealth"
];
const profileConfig = parseCustomConfig(profileArgv);

assert.equal(profileConfig.stealthEnabled, false);
assert.equal(profileConfig.profileDir.endsWith("/profiles/demo"), true);

const normalizedProfileArgv = normalizeArgv(profileArgv, profileConfig);
assert.deepEqual(normalizedProfileArgv.slice(0, 6), [
  "node",
  "cli.js",
  "open",
  "--user-data-dir",
  "./profiles/demo",
  "--disable-stealth"
]);

const extensionArgv = [
  "node",
  "cli.js",
  "open",
  "--extension-path",
  "./extensions/a",
  "--extension-path=./extensions/b"
];
const extensionConfig = parseCustomConfig(extensionArgv);

assert.equal(extensionConfig.stealthEnabled, true);
assert.equal(extensionConfig.extensionPaths.length, 2);
assert.ok(extensionConfig.profileDir.includes("playwright-cli-profile-"));

const normalizedExtensionArgv = normalizeArgv(extensionArgv, extensionConfig);
assert.equal(normalizedExtensionArgv.includes("--user-data-dir"), true);

const temporaryArgv = [
  "node",
  "cli.js",
  "open",
  "--temp-profile"
];
const temporaryConfig = parseCustomConfig(temporaryArgv);
assert.equal(temporaryConfig.useTemporaryProfile, true);
assert.ok(temporaryConfig.profileDir.includes("playwright-cli-profile-"));

const chromeArgv = [
  "node",
  "cli.js",
  "open",
  "--channel",
  "chrome"
];
const chromeConfig = parseCustomConfig(chromeArgv);
assert.equal(chromeConfig.channel, "chrome");
assert.ok(chromeConfig.profileDir.includes("playwright-cli-profile-"));
assert.equal(normalizeArgv(chromeArgv, chromeConfig).includes("--user-data-dir"), true);

const rootHelp = execFileSync("node", ["./cli.js", "--help"], { cwd: __dirname + "/..", encoding: "utf8" });
assert.ok(rootHelp.includes("profile-list"));
assert.ok(rootHelp.includes("profile-status [options] <directory>"));

console.log("smoke ok");
