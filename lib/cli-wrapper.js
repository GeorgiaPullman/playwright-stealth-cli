"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { addExtra } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const BROWSER_COMMANDS = new Set([
  "open",
  "codegen",
  "screenshot",
  "pdf",
  "cr",
  "ff",
  "wk"
]);
const TEMP_PROFILE_PREFIX = "playwright-cli-profile-";
const MANAGED_PROCESS_FLAG = "--playwright-stealth-cli=1";

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
  const tempRoot = os.tmpdir();
  let entries = [];
  try {
    entries = fs.readdirSync(tempRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PROFILE_PREFIX))
      continue;

    try {
      fs.rmSync(path.join(tempRoot, entry.name), { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures so they never block browser startup.
    }
  }
}

function currentCommandName(argv) {
  return argv.slice(2).find((arg) => !arg.startsWith("-"));
}

function inferBrowserType(argv) {
  const commandName = currentCommandName(argv);
  if (!commandName || !BROWSER_COMMANDS.has(commandName))
    return void 0;

  if (commandName === "cr")
    return "chromium";
  if (commandName === "ff")
    return "firefox";
  if (commandName === "wk")
    return "webkit";

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--browser" || arg === "-b") {
      const value = argv[i + 1];
      if (value === "ff" || value === "firefox")
        return "firefox";
      if (value === "wk" || value === "webkit")
        return "webkit";
      return "chromium";
    }
    if (arg.startsWith("--browser=")) {
      const value = arg.slice("--browser=".length);
      if (value === "ff" || value === "firefox")
        return "firefox";
      if (value === "wk" || value === "webkit")
        return "webkit";
      return "chromium";
    }
  }

  return "chromium";
}

function parseCustomConfig(argv) {
  const browserCommand = isBrowserCommand(argv);
  const config = {
    stealthEnabled: true,
    extensionPaths: [],
    profileDir: void 0,
    hasUserDataDir: false,
    useTemporaryProfile: browserCommand,
    injectedUserDataDir: void 0,
    browserType: inferBrowserType(argv),
    channel: void 0,
    browserCommand,
    forceProfile: false
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

    if (arg === "--channel") {
      config.channel = consumeValue(argv, i, arg);
      i++;
      continue;
    }

    if (arg.startsWith("--channel=")) {
      config.channel = arg.slice("--channel=".length);
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
      config.profileDir = consumeValue(argv, i, arg);
      config.hasUserDataDir = true;
      i++;
      continue;
    }

    if (arg.startsWith("--profile-dir=")) {
      config.profileDir = arg.slice("--profile-dir=".length);
      config.hasUserDataDir = true;
      continue;
    }

    if (arg.startsWith("--profile-directory=")) {
      config.profileDir = arg.slice("--profile-directory=".length);
      config.hasUserDataDir = true;
      continue;
    }

    if (arg === "--user-data-dir") {
      config.profileDir = consumeValue(argv, i, arg);
      config.hasUserDataDir = true;
      i++;
      continue;
    }

    if (arg.startsWith("--user-data-dir=")) {
      config.profileDir = arg.slice("--user-data-dir=".length);
      config.hasUserDataDir = true;
    }
  }

  config.extensionPaths = [...new Set(config.extensionPaths.map((extensionPath) => path.resolve(extensionPath)))];

  if (config.profileDir)
    config.profileDir = path.resolve(config.profileDir);

  if (config.useTemporaryProfile && !config.hasUserDataDir && !config.profileDir) {
    cleanupOldTemporaryProfiles();
    config.injectedUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PROFILE_PREFIX));
    config.profileDir = config.injectedUserDataDir;
  }

  return config;
}

function normalizeArgv(argv, config) {
  const normalized = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (i < 2) {
      normalized.push(arg);
      continue;
    }

    if (arg === "--profile-dir" || arg === "--profile-directory") {
      normalized.push("--user-data-dir", consumeValue(argv, i, arg));
      i++;
      continue;
    }

    if (arg.startsWith("--profile-dir=")) {
      normalized.push(`--user-data-dir=${arg.slice("--profile-dir=".length)}`);
      continue;
    }

    if (arg.startsWith("--profile-directory=")) {
      normalized.push(`--user-data-dir=${arg.slice("--profile-directory=".length)}`);
      continue;
    }

    if (arg === "--temp-profile" || arg === "--temporary-profile")
      continue;

    if (arg === "--force-profile")
      continue;

    normalized.push(arg);
  }

  if (config.profileDir && !config.hasUserDataDir)
    normalized.push("--user-data-dir", config.profileDir);

  return normalized;
}

function isBrowserCommand(argv) {
  return argv.slice(2).some((arg) => BROWSER_COMMANDS.has(arg));
}

function shouldSkipRuntimeValidation(argv) {
  return argv.includes("--help") || argv.includes("-h") || argv.includes("--version") || argv.includes("-V");
}

function ensureSupportedExtensionCommand(config, argv) {
  if (!config.extensionPaths.length)
    return;

  if (!isBrowserCommand(argv))
    throw new Error("Browser extensions are only supported for Playwright browser commands like open/codegen/cr.");
}

function assertExtensionDirectories(extensionPaths) {
  for (const extensionPath of extensionPaths) {
    if (!fs.existsSync(extensionPath))
      throw new Error(`Extension path does not exist: ${extensionPath}`);
    if (!fs.statSync(extensionPath).isDirectory())
      throw new Error(`Extension path must be a directory: ${extensionPath}`);
  }
}

function extensionArgs(extensionPaths, args = []) {
  const merged = [...args];
  const joined = extensionPaths.join(",");
  merged.push(`--disable-extensions-except=${joined}`);
  merged.push(`--load-extension=${joined}`);
  return merged;
}

function managedProcessArgs(args = []) {
  return args.includes(MANAGED_PROCESS_FLAG) ? [...args] : [...args, MANAGED_PROCESS_FLAG];
}

function extractOptionValue(argsText, optionName) {
  const inlineQuotedMatch = argsText.match(new RegExp(`${optionName}=("[^"]+"|'[^']+')`));
  if (inlineQuotedMatch)
    return inlineQuotedMatch[1].replace(/^['"]|['"]$/g, "");

  const inlinePlainMatch = argsText.match(new RegExp(`${optionName}=([\\s\\S]*?)(?=\\s--\\S|$)`));
  if (inlinePlainMatch)
    return inlinePlainMatch[1].trim();

  const spacedQuotedMatch = argsText.match(new RegExp(`${optionName}\\s+("[^"]+"|'[^']+')`));
  if (spacedQuotedMatch)
    return spacedQuotedMatch[1].replace(/^['"]|['"]$/g, "");

  const spacedPlainMatch = argsText.match(new RegExp(`${optionName}\\s+([\\s\\S]*?)(?=\\s--\\S|$)`));
  if (spacedPlainMatch)
    return spacedPlainMatch[1].trim();

  return void 0;
}

function inferBrowserLabel(name, argsText) {
  const haystack = `${name} ${argsText}`.toLowerCase();
  if (haystack.includes("chromium"))
    return "chromium";
  if (haystack.includes("chrome"))
    return "chrome";
  if (haystack.includes("msedge") || haystack.includes("edge"))
    return "edge";
  if (haystack.includes("firefox"))
    return "firefox";
  if (haystack.includes("webkit"))
    return "webkit";
  return "unknown";
}

function listProcessesUnix() {
  const output = execFileSync("ps", ["-axww", "-o", "pid=", "-o", "comm=", "-o", "args="], {
    encoding: "utf8"
  });

  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!match)
      return null;
    const [, pid, command, argsText] = match;
    return {
      pid: Number(pid),
      name: command,
      args: argsText
    };
  }).filter(Boolean);
}

function listProcessesWindows() {
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const output = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
  if (!output)
    return [];
  const parsed = JSON.parse(output);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row) => ({
    pid: Number(row.ProcessId),
    name: row.Name || "",
    args: row.CommandLine || ""
  }));
}

function listRunningBrowserProcesses() {
  let processes = [];
  try {
    processes = process.platform === "win32" ? listProcessesWindows() : listProcessesUnix();
  } catch {
    return [];
  }

  return processes.map((proc) => {
    const userDataDir = extractOptionValue(proc.args, "--user-data-dir");
    const browser = inferBrowserLabel(proc.name, proc.args);
    const managed = proc.args.includes(MANAGED_PROCESS_FLAG);
    return {
      ...proc,
      browser,
      managed,
      userDataDir: userDataDir ? path.resolve(userDataDir) : void 0
    };
  }).filter((proc) => proc.managed && proc.userDataDir);
}

function profileUsage(profileDir) {
  const resolvedProfileDir = path.resolve(profileDir);
  return listRunningBrowserProcesses().filter((proc) => proc.userDataDir === resolvedProfileDir);
}

async function confirmProfileReuse(profileDir, holders) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(`Profile is already in use: ${profileDir}. Re-run with --force-profile to continue anyway.`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const summary = holders.map((holder) => `${holder.browser} pid=${holder.pid}`).join(", ");
  const answer = await new Promise((resolve) => {
    rl.question(`Profile is already in use by ${summary}. Continue anyway? [y/N] `, resolve);
  });
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}

async function ensureProfileAvailable(config) {
  if (!config.profileDir)
    return;

  const holders = profileUsage(config.profileDir);
  if (!holders.length || config.forceProfile)
    return;

  const confirmed = await confirmProfileReuse(config.profileDir, holders);
  if (!confirmed)
    throw new Error(`Aborted because profile is already in use: ${config.profileDir}`);
}

function printProfileList(options = {}) {
  const holders = listRunningBrowserProcesses();
  if (!holders.length) {
    if (options.json) {
      console.log("[]");
      return;
    }
    console.log("No running Chrome/Chromium processes with explicit profiles found.");
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(holders, null, 2));
    return;
  }

  for (const holder of holders) {
    console.log(`${holder.browser}\tpid=${holder.pid}\tprofile=${holder.userDataDir}`);
  }
}

function printProfileStatus(profileDir) {
  const resolvedProfileDir = path.resolve(profileDir);
  const holders = profileUsage(resolvedProfileDir);
  if (!holders.length) {
    console.log(`Profile is not currently in use: ${resolvedProfileDir}`);
    return;
  }

  console.log(`Profile is currently in use: ${resolvedProfileDir}`);
  for (const holder of holders)
    console.log(`- ${holder.browser} pid=${holder.pid}`);
}

function wrapBrowserType(browserType, browserName, config) {
  const originalLaunch = browserType.launch.bind(browserType);
  const originalLaunchPersistentContext = browserType.launchPersistentContext.bind(browserType);

  browserType.launch = async (options = {}) => {
    if (browserName !== "chromium")
      return originalLaunch(options);

    const nextOptions = {
      ...options,
      args: managedProcessArgs(options.args)
    };

    if (!config.extensionPaths.length)
      return originalLaunch(nextOptions);

    if (nextOptions.headless !== false)
      throw new Error("Browser extensions require headful Chromium. Use open/codegen/cr or remove the extension option.");

    return originalLaunch({
      ...nextOptions,
      args: extensionArgs(config.extensionPaths, nextOptions.args)
    });
  };

  browserType.launchPersistentContext = async (userDataDir, options = {}) => {
    if (browserName !== "chromium")
      return originalLaunchPersistentContext(userDataDir, options);

    const nextOptions = {
      ...options,
      args: managedProcessArgs(options.args)
    };

    if (!config.extensionPaths.length)
      return originalLaunchPersistentContext(userDataDir, nextOptions);

    if (nextOptions.headless !== false)
      throw new Error("Browser extensions require headful Chromium. Use open/codegen/cr or remove the extension option.");

    return originalLaunchPersistentContext(userDataDir, {
      ...nextOptions,
      args: extensionArgs(config.extensionPaths, nextOptions.args)
    });
  };

  return browserType;
}

function patchPlaywright(config) {
  const playwright = require("playwright");
  const chromium = addExtra(playwright.chromium);

  if (config.stealthEnabled)
    chromium.use(StealthPlugin());

  playwright.chromium = wrapBrowserType(chromium, "chromium", config);
  playwright.firefox = wrapBrowserType(playwright.firefox, "firefox", config);
  playwright.webkit = wrapBrowserType(playwright.webkit, "webkit", config);

  return playwright;
}

function addCustomOptions(program) {
  for (const command of program.commands) {
    const hasUserDataDirOption = command.options.some((option) => option.long === "--user-data-dir");
    if (!hasUserDataDirOption)
      continue;

    command.option("--profile-dir <directory>", "alias of --user-data-dir for a persistent browser profile");
    command.option("--temp-profile", "use a temporary browser profile (this is the default)");
    command.option("--force-profile", "continue even if the target profile appears to already be in use");
    command.option("--extension-path <path>", "load an unpacked Chromium extension; repeat the option to load multiple extensions");
    command.option("--disable-stealth", "disable the stealth plugin (enabled by default)");
  }
}

function addProfileCommands(program) {
  program.command("profile-list").description("list running Chrome/Chromium processes and their profile directories").option("--json", "output machine-readable JSON").action((options) => {
    printProfileList(options);
  });
  program.command("profile-status <directory>").description("check whether a profile directory is currently in use").action((directory) => {
    printProfileStatus(directory);
  });
}

async function run(argv = process.argv) {
  const config = parseCustomConfig(argv);
  if (!shouldSkipRuntimeValidation(argv)) {
    ensureSupportedExtensionCommand(config, argv);
    assertExtensionDirectories(config.extensionPaths);
  }
  if (isBrowserCommand(argv))
    await ensureProfileAvailable(config);
  patchPlaywright(config);

  const { program } = require("playwright/lib/program");
  program.name("playwright-stealth");
  addCustomOptions(program);
  addProfileCommands(program);
  await program.parseAsync(normalizeArgv(argv, config));
}

module.exports = {
  addCustomOptions,
  addProfileCommands,
  confirmProfileReuse,
  ensureProfileAvailable,
  listRunningBrowserProcesses,
  printProfileList,
  printProfileStatus,
  normalizeArgv,
  parseCustomConfig,
  patchPlaywright,
  profileUsage,
  run
};
