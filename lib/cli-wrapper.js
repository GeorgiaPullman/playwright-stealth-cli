"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn, execFileSync } = require("child_process");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const TEMP_PROFILE_PREFIX = "playwright-cli-profile-";
const WRAPPER_META_KEY = "__playwrightStealthCli";

let currentOpenConfig = null;
let sessionPatchInstalled = false;

function cliPackageRoot() {
  return path.dirname(require.resolve("@playwright/cli/package.json"));
}

function bundledPlaywrightRoot() {
  return path.join(cliPackageRoot(), "node_modules", "playwright");
}

function bundledRequire(relativePath) {
  return require(path.join(bundledPlaywrightRoot(), relativePath));
}

function bundledCoreRequire() {
  return require(path.join(cliPackageRoot(), "node_modules", "playwright-core"));
}

function consumeValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-"))
    throw new Error(`${optionName} requires a value`);
  return value;
}

function splitExtensionValues(rawValue) {
  return rawValue.split(",").map((item) => item.trim()).filter(Boolean);
}

function cleanupOldTemporaryProfiles() {
  let entries = [];
  try {
    entries = fs.readdirSync(os.tmpdir(), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PROFILE_PREFIX))
      continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), entry.name), { recursive: true, force: true });
    } catch {
    }
  }
}

function createTemporaryProfileDir() {
  cleanupOldTemporaryProfiles();
  return fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PROFILE_PREFIX));
}

function currentCommandName(argv) {
  return argv.slice(2).find((arg) => !arg.startsWith("-"));
}

function shouldSkipRuntimeValidation(argv) {
  return argv.includes("--help") || argv.includes("-h") || argv.includes("--version") || argv.includes("-V");
}

function assertExtensionDirectories(extensionPaths) {
  for (const extensionPath of extensionPaths) {
    if (!fs.existsSync(extensionPath))
      throw new Error(`Extension path does not exist: ${extensionPath}`);
    if (!fs.statSync(extensionPath).isDirectory())
      throw new Error(`Extension path must be a directory: ${extensionPath}`);
  }
}

function isHeadless(argv) {
  if (argv.includes("--headed"))
    return false;
  if (argv.includes("--headless"))
    return true;
  return false;
}

function parseOpenConfig(argv) {
  const commandName = currentCommandName(argv);
  const isOpen = commandName === "open";
  const config = {
    commandName,
    isOpen,
    stealthEnabled: true,
    extensionPaths: [],
    profileDir: void 0,
    forceProfile: false,
    browser: void 0,
    explicitPersistent: false,
    explicitProfile: false,
    useTemporaryProfile: false,
    headless: isHeadless(argv)
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--disable-stealth" || arg === "--no-stealth") {
      config.stealthEnabled = false;
      continue;
    }
    if (arg === "--stealth") {
      config.stealthEnabled = true;
      continue;
    }
    if (arg === "--temp-profile" || arg === "--temporary-profile") {
      config.useTemporaryProfile = true;
      continue;
    }
    if (arg === "--force-profile") {
      config.forceProfile = true;
      continue;
    }
    if (arg === "--extension-path" || arg === "--extension") {
      config.extensionPaths.push(...splitExtensionValues(consumeValue(argv, i, arg)));
      i++;
      continue;
    }
    if (arg.startsWith("--extension-path=")) {
      config.extensionPaths.push(...splitExtensionValues(arg.slice("--extension-path=".length)));
      continue;
    }
    if (arg.startsWith("--extension=")) {
      config.extensionPaths.push(...splitExtensionValues(arg.slice("--extension=".length)));
      continue;
    }
    if (arg === "--profile-dir" || arg === "--profile-directory") {
      config.profileDir = path.resolve(consumeValue(argv, i, arg));
      config.explicitProfile = true;
      i++;
      continue;
    }
    if (arg.startsWith("--profile-dir=")) {
      config.profileDir = path.resolve(arg.slice("--profile-dir=".length));
      config.explicitProfile = true;
      continue;
    }
    if (arg.startsWith("--profile-directory=")) {
      config.profileDir = path.resolve(arg.slice("--profile-directory=".length));
      config.explicitProfile = true;
      continue;
    }
    if (arg === "--profile") {
      config.profileDir = path.resolve(consumeValue(argv, i, arg));
      config.explicitProfile = true;
      config.explicitPersistent = true;
      i++;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      config.profileDir = path.resolve(arg.slice("--profile=".length));
      config.explicitProfile = true;
      config.explicitPersistent = true;
      continue;
    }
    if (arg === "--persistent") {
      config.explicitPersistent = true;
      continue;
    }
    if (arg === "--browser") {
      config.browser = consumeValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith("--browser=")) {
      config.browser = arg.slice("--browser=".length);
      continue;
    }
    if (arg === "--channel") {
      config.browser = consumeValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg.startsWith("--channel=")) {
      config.browser = arg.slice("--channel=".length);
    }
  }

  config.extensionPaths = [...new Set(config.extensionPaths.map((p) => path.resolve(p)))];

  if (isOpen && !config.browser)
    config.browser = "chromium";

  if (isOpen && !config.explicitProfile && !config.explicitPersistent)
    config.useTemporaryProfile = true;

  if (config.useTemporaryProfile && isOpen && !config.profileDir)
    config.profileDir = createTemporaryProfileDir();

  return config;
}

function normalizeArgv(argv, config) {
  const normalized = argv.slice(0, 2);

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--disable-stealth" || arg === "--no-stealth" || arg === "--stealth" || arg === "--temp-profile" || arg === "--temporary-profile" || arg === "--force-profile") {
      continue;
    }

    if (arg === "--extension-path" || arg === "--extension") {
      i++;
      continue;
    }
    if (arg.startsWith("--extension-path=") || arg.startsWith("--extension="))
      continue;

    if (arg === "--profile-dir" || arg === "--profile-directory") {
      normalized.push("--profile", consumeValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg.startsWith("--profile-dir=")) {
      normalized.push(`--profile=${arg.slice("--profile-dir=".length)}`);
      continue;
    }
    if (arg.startsWith("--profile-directory=")) {
      normalized.push(`--profile=${arg.slice("--profile-directory=".length)}`);
      continue;
    }

    if (arg === "--channel") {
      normalized.push("--browser", consumeValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg.startsWith("--channel=")) {
      normalized.push(`--browser=${arg.slice("--channel=".length)}`);
      continue;
    }

    normalized.push(arg);
  }

  if (config.isOpen) {
    const hasBrowser = normalized.some((arg, index) => arg === "--browser" || arg.startsWith("--browser=") || (arg === "-b" && normalized[index + 1]));
    const hasProfile = normalized.some((arg) => arg === "--profile" || arg.startsWith("--profile="));
    const hasPersistent = normalized.includes("--persistent");

    if (!hasBrowser && config.browser)
      normalized.push("--browser", config.browser);

    if (config.profileDir && !hasProfile)
      normalized.push("--profile", config.profileDir);

    if ((config.profileDir || config.explicitPersistent) && !hasPersistent)
      normalized.push("--persistent");
  }

  return normalized;
}

function browserSupportsStealth(browser) {
  return !browser || browser.startsWith("chrom");
}

function browserSupportsExtensionFlags(browser) {
  return !browser || browser === "chromium";
}

function extensionArgs(extensionPaths, args = []) {
  if (!extensionPaths.length)
    return args;
  const joined = extensionPaths.join(",");
  return [...args, `--disable-extensions-except=${joined}`, `--load-extension=${joined}`];
}

function resolveProfileFromEntry(entry) {
  return path.resolve(
    entry.config?.resolvedConfig?.browser?.userDataDir || entry.config?.cli?.profile || ""
  );
}

async function loadRegistryEntries() {
  const { Registry, createClientInfo } = bundledRequire("lib/cli/client/registry.js");
  const registry = await Registry.load();
  const entries = [];
  for (const list of registry.entryMap().values())
    entries.push(...list);
  return { entries, clientInfo: createClientInfo() };
}

async function liveSessionInfo(entry, clientInfo) {
  const { Session } = bundledRequire("lib/cli/client/session.js");
  const session = new Session(clientInfo, entry.config);
  const alive = await session.canConnect().catch(() => false);
  if (!alive)
    return null;
  const profileDir = resolveProfileFromEntry(entry);
  return {
    session: entry.config.name,
    profileDir: profileDir || void 0,
    browser: entry.config?.resolvedConfig?.browser?.launchOptions?.channel || entry.config?.resolvedConfig?.browser?.browserName || entry.config?.cli?.browser || "unknown",
    headed: entry.config?.resolvedConfig?.browser?.launchOptions?.headless === false
  };
}

async function listSessionProfiles() {
  const { entries, clientInfo } = await loadRegistryEntries();
  const results = [];
  for (const entry of entries) {
    const info = await liveSessionInfo(entry, clientInfo);
    if (info)
      results.push(info);
  }
  return results;
}

async function profileUsage(profileDir) {
  const resolved = path.resolve(profileDir);
  const sessions = await listSessionProfiles();
  return sessions.filter((session) => session.profileDir === resolved);
}

async function confirmProfileReuse(profileDir, holders) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(`Profile is already in use: ${profileDir}. Re-run with --force-profile to continue anyway.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const summary = holders.map((holder) => `${holder.browser} session=${holder.session}`).join(", ");
  const answer = await new Promise((resolve) => {
    rl.question(`Profile is already in use by ${summary}. Continue anyway? [y/N] `, resolve);
  });
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}

async function ensureProfileAvailable(config) {
  if (!config.isOpen || !config.profileDir || config.forceProfile)
    return;
  const holders = await profileUsage(config.profileDir);
  if (!holders.length)
    return;
  const confirmed = await confirmProfileReuse(config.profileDir, holders);
  if (!confirmed)
    throw new Error(`Aborted because profile is already in use: ${config.profileDir}`);
}

async function printProfileList(options = {}) {
  const sessions = await listSessionProfiles();
  if (options.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (!sessions.length) {
    console.log("No running wrapper-managed browser sessions found.");
    return;
  }
  for (const session of sessions) {
    console.log(`${session.browser}\tsession=${session.session}\tprofile=${session.profileDir || "<in-memory>"}\theaded=${session.headed}`);
  }
}

async function printProfileStatus(profileDir, options = {}) {
  const resolved = path.resolve(profileDir);
  const holders = await profileUsage(resolved);
  if (options.json) {
    console.log(JSON.stringify({ profile: resolved, inUse: holders.length > 0, holders }, null, 2));
    return;
  }
  if (!holders.length) {
    console.log(`Profile is not currently in use: ${resolved}`);
    return;
  }
  console.log(`Profile is currently in use: ${resolved}`);
  for (const holder of holders)
    console.log(`- ${holder.browser} session=${holder.session}`);
}

function patchSessionLauncher() {
  if (sessionPatchInstalled)
    return;
  sessionPatchInstalled = true;

  const sessionModule = bundledRequire("lib/cli/client/session.js");
  const { Session } = sessionModule;
  Session.prototype._startDaemon = async function patchedStartDaemon() {
    await fs.promises.mkdir(this._clientInfo.daemonProfilesDir, { recursive: true });
    const cliPath = path.resolve(__dirname, "..", "cli.js");
    const sessionConfigFile = this._sessionFile(".session");
    this.config.version = this._clientInfo.version;
    this.config.timestamp = Date.now();
    this.config.cli ||= {};
    this.config.cli[WRAPPER_META_KEY] = {
      stealthEnabled: currentOpenConfig?.stealthEnabled !== false,
      extensionPaths: currentOpenConfig?.extensionPaths || [],
      tempProfile: currentOpenConfig?.useTemporaryProfile === true
    };
    await fs.promises.writeFile(sessionConfigFile, JSON.stringify(this.config, null, 2));

    const errLog = this._sessionFile(".err");
    const err = fs.openSync(errLog, "w");
    const args = [cliPath, "run-cli-server", `--daemon-session=${sessionConfigFile}`];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", "pipe", err],
      cwd: process.cwd()
    });

    let signalled = false;
    const sigintHandler = () => {
      signalled = true;
      child.kill("SIGINT");
    };
    const sigtermHandler = () => {
      signalled = true;
      child.kill("SIGTERM");
    };
    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);

    let outLog = "";
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (data) => {
        outLog += data.toString();
        if (!outLog.includes("<EOF>"))
          return;
        const errorMatch = outLog.match(/### Error\n([\s\S]*)<EOF>/);
        const error = errorMatch ? errorMatch[1].trim() : void 0;
        if (error) {
          const errLogContent = fs.readFileSync(errLog, "utf-8");
          const message = error + (errLogContent ? "\n" + errLogContent : "");
          reject(new Error(message));
          return;
        }
        const successMatch = outLog.match(/### Success\nDaemon listening on (.*)\n<EOF>/);
        if (successMatch)
          resolve();
      });
      child.on("close", (code) => {
        if (!signalled)
          reject(new Error(`Daemon process exited with code ${code}`));
      });
    });

    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
    child.stdout.destroy();
    child.unref();

    const { socket } = await this._connect();
    if (!socket) {
      console.error(`Failed to connect to daemon at ${this.config.socketPath}`);
      process.exit(1);
    }

    console.log(`### Browser \`${this.name}\` opened with pid ${child.pid}.`);
    const resolvedConfig = parseResolvedConfig(outLog);
    if (resolvedConfig) {
      this.config.resolvedConfig = resolvedConfig;
      console.log(`- ${this.name}:`);
      for (const line of sessionModule.renderResolvedConfig(resolvedConfig))
        console.log(line);
    }
    console.log("---");
    this.config.timestamp = Date.now();
    await fs.promises.writeFile(sessionConfigFile, JSON.stringify(this.config, null, 2));
    return socket;
  };
}

function parseResolvedConfig(outLog) {
  const marker = "### Config\n```json\n";
  const markerIndex = outLog.indexOf(marker);
  if (markerIndex === -1)
    return null;
  const jsonStart = markerIndex + marker.length;
  const jsonEnd = outLog.indexOf("\n```", jsonStart);
  if (jsonEnd === -1)
    return null;
  try {
    return JSON.parse(outLog.substring(jsonStart, jsonEnd).trim());
  } catch {
    return null;
  }
}

function applyStealthPatch(meta) {
  if (!meta?.stealthEnabled)
    return;
  const playwrightCore = bundledCoreRequire();
  const chromium = addExtra(playwrightCore.chromium);
  chromium.use(StealthPlugin());
  playwrightCore.chromium = chromium;
}

async function resolveDaemonConfig(sessionConfigPath) {
  const sessionConfig = JSON.parse(await fs.promises.readFile(sessionConfigPath, "utf-8"));
  const configModule = bundledRequire("lib/mcp/browser/config.js");
  const cliDaemonProgram = bundledRequire("lib/cli/daemon/program.js");
  const meta = sessionConfig.cli?.[WRAPPER_META_KEY] || {};

  applyStealthPatch(meta);

  const daemonOverrides = configModule.configFromCLIOptions({
    config: sessionConfig.cli.config,
    browser: sessionConfig.cli.browser,
    isolated: sessionConfig.cli.persistent === true ? false : void 0,
    headless: sessionConfig.cli.headed ? false : void 0,
    extension: sessionConfig.cli.extension,
    userDataDir: sessionConfig.cli.profile,
    outputMode: "file",
    snapshotMode: "full"
  });
  const envOverrides = configModule.configFromEnv();
  const configFile = envOverrides.configFile ?? daemonOverrides.configFile;
  const configInFile = await configModule.loadConfig(configFile);
  let result = configModule.mergeConfig(configModule.defaultConfig, {
    browser: {
      launchOptions: {
        headless: true
      },
      isolated: true
    }
  });
  result = configModule.mergeConfig(result, configInFile);
  result = configModule.mergeConfig(result, daemonOverrides);
  result = configModule.mergeConfig(result, envOverrides);

  if (!result.extension && !result.browser.userDataDir && sessionConfig.userDataDirPrefix) {
    const browserToken = result.browser.launchOptions?.channel ?? result.browser?.browserName;
    result.browser.userDataDir = `${sessionConfig.userDataDirPrefix}-${browserToken}`;
  }

  const extensionPaths = meta.extensionPaths || [];
  if (extensionPaths.length) {
    assertExtensionDirectories(extensionPaths);
    const browserToken = result.browser.launchOptions?.channel ?? result.browser?.browserName ?? sessionConfig.cli.browser ?? "chromium";
    if (!browserSupportsExtensionFlags(browserToken))
      throw new Error("Command-line extension loading is only supported for Chromium in this wrapper. For Chrome, use a persistent profile and install the extension manually.");
    if (result.browser.launchOptions.headless !== false)
      throw new Error("Browser extensions require headful Chromium.");
    result.browser.launchOptions.args = extensionArgs(extensionPaths, result.browser.launchOptions.args || []);
  }

  result.configFile = configFile;
  result.sessionConfig = sessionConfig;
  result.skillMode = true;
  if (result.sessionConfig && result.browser.launchOptions.headless !== false)
    result.browser.contextOptions.viewport ??= { width: 1280, height: 720 };

  await configModule.validateConfig(result);
  return { config: result, meta, cliDaemonProgram };
}

async function runCliServer(argv) {
  const daemonSessionArg = argv.slice(2).find((arg) => arg.startsWith("--daemon-session="));
  const daemonSessionPath = daemonSessionArg ? daemonSessionArg.slice("--daemon-session=".length) : (() => {
    const index = argv.indexOf("--daemon-session");
    return index >= 0 ? argv[index + 1] : void 0;
  })();

  if (!daemonSessionPath)
    throw new Error("--daemon-session is required");

  const { config } = await resolveDaemonConfig(daemonSessionPath);
  const { setupExitWatchdog } = bundledRequire("lib/mcp/browser/watchdog.js");
  const { contextFactory } = bundledRequire("lib/mcp/browser/browserContextFactory.js");
  const { ExtensionContextFactory } = bundledRequire("lib/mcp/extension/extensionContextFactory.js");
  const { startMcpDaemonServer } = bundledRequire("lib/cli/daemon/daemon.js");

  setupExitWatchdog();
  const browserContextFactory = contextFactory(config);
  const extensionContextFactory = new ExtensionContextFactory(
    config.browser.launchOptions.channel || "chrome",
    config.browser.userDataDir,
    config.browser.launchOptions.executablePath
  );
  const cf = config.extension ? extensionContextFactory : browserContextFactory;

  try {
    const socketPath = await startMcpDaemonServer(config, cf);
    console.log("### Config");
    console.log("```json");
    console.log(JSON.stringify(config, null, 2));
    console.log("```");
    console.log(`### Success\nDaemon listening on ${socketPath}`);
    console.log("<EOF>");
  } catch (error) {
    const message = process.env.PWDEBUGIMPL ? error.stack || error.message : error.message;
    console.log(`### Error\n${message}`);
    console.log("<EOF>");
  }
}

function showTopLevelHelp() {
  const help = bundledRequire("lib/cli/client/help.json");
  console.log("playwright-stealth - run playwright-cli commands with stealth enabled by default for Chromium");
  console.log("");
  console.log(help.global);
  console.log("");
  console.log(`Wrapper additions:
  profile-list [--json]      list active wrapper-managed sessions and their profiles
  profile-status <dir>       check whether a profile is currently in use

Additional wrapper options for 'open':
  --disable-stealth          disable stealth plugin (enabled by default for Chromium)
  --profile-dir <dir>        alias of --profile for an explicit persistent profile
  --temp-profile             force a temporary profile
  --extension-path <dir>     load unpacked Chromium extension(s)
  --channel <name>           alias of --browser, for example chrome or chromium
  --force-profile            continue even if the target profile appears to be in use`);
}

function showOpenHelp() {
  const help = bundledRequire("lib/cli/client/help.json");
  console.log(help.commands.open);
  console.log(`
Wrapper additions:
  --disable-stealth          disable stealth plugin (enabled by default for Chromium)
  --profile-dir <dir>        alias of --profile for an explicit persistent profile
  --temp-profile             force a temporary profile
  --extension-path <dir>     load unpacked Chromium extension(s), Chromium only
  --channel <name>           alias of --browser
  --force-profile            continue even if the target profile appears to be in use`);
}

async function runClient(argv) {
  const config = parseOpenConfig(argv);
  if (!shouldSkipRuntimeValidation(argv)) {
    assertExtensionDirectories(config.extensionPaths);
    if (config.extensionPaths.length && config.headless)
      throw new Error("Browser extensions require headful Chromium.");
    if (config.extensionPaths.length && !browserSupportsExtensionFlags(config.browser))
      throw new Error("Command-line extension loading is only supported for Chromium in this wrapper. For Chrome, use a persistent profile and install the extension manually.");
  }

  await ensureProfileAvailable(config);
  patchSessionLauncher();
  currentOpenConfig = config;
  process.argv = normalizeArgv(argv, config);

  require(path.join(bundledPlaywrightRoot(), "lib/cli/client/program.js"));
}

async function run(argv = process.argv) {
  const commandName = currentCommandName(argv);
  const wantsHelp = argv.includes("--help") || argv.includes("-h");

  if (!commandName) {
    showTopLevelHelp();
    return;
  }

  if (wantsHelp && (!commandName || commandName === "help")) {
    showTopLevelHelp();
    return;
  }

  if (wantsHelp && commandName === "open") {
    showOpenHelp();
    return;
  }

  if (commandName === "profile-list") {
    await printProfileList({ json: argv.includes("--json") });
    return;
  }

  if (commandName === "profile-status") {
    const target = argv.slice(2).find((arg, index, list) => index > 0 && !arg.startsWith("-"));
    if (!target)
      throw new Error("profile-status requires a directory argument");
    await printProfileStatus(target, { json: argv.includes("--json") });
    return;
  }

  if (commandName === "run-cli-server") {
    await runCliServer(argv);
    return;
  }

  await runClient(argv);
}

module.exports = {
  cleanupOldTemporaryProfiles,
  confirmProfileReuse,
  ensureProfileAvailable,
  listSessionProfiles,
  normalizeArgv,
  parseOpenConfig,
  printProfileList,
  printProfileStatus,
  profileUsage,
  run,
  runCliServer
};
