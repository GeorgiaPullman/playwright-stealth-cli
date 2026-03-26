name: playwright-stealth-cli
description: Uses playwright-stealth-cli for browser-driving Playwright CLI commands with stealth enabled by default, temporary-profile defaults, explicit persistent profiles, and Chromium extension support. Use when the user wants Playwright CLI-style browser launching with lower automation fingerprints, persistent login profiles, or Chromium extension loading.
allowed-tools: Bash

# Browser Automation with playwright-stealth-cli

## When to use

Use this skill when the user wants:

- Playwright CLI browser-driving commands such as `open`, `codegen`, `screenshot`, `pdf`, `cr`, `ff`, or `wk`
- stealth enabled by default
- a quick temporary-profile run
- a persistent profile for login flows
- unpacked Chromium extension loading

Do not assume this skill automatically applies to `playwright test`.

## Command name

The package name is `playwright-stealth-cli`, but the installed command is:

```bash
playwright-stealth
```

Local development entry point:

```bash
node ./cli.js
```

## Quick start

```bash
# open with default behavior: chromium + stealth + temporary profile
playwright-stealth open https://example.com

# open with a persistent Chromium profile
playwright-stealth open --profile-dir "/path/to/chromium-main" https://example.com

# use stock Chrome
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-main" https://example.com

# disable stealth explicitly
playwright-stealth open --disable-stealth https://example.com
```

## Profile rules

- Default mode uses a temporary profile.
- Old `playwright-cli-profile-*` temp folders are cleaned up on startup when possible.
- For login flows and long-lived state, prefer `--profile-dir`.
- Keep Chrome and Chromium profiles separate.
- Do not reuse the same profile directory between Chrome and Chromium.
- The CLI can list active browser/profile pairs with `playwright-stealth profile-list`.
- The CLI can emit machine-readable process/profile output with `playwright-stealth profile-list --json`.
- The CLI can check a specific profile with `playwright-stealth profile-status "/path/to/profile"`.
- If a profile appears busy, the CLI will ask before continuing unless `--force-profile` is used.
- `profile-list` only reports wrapper-managed browser processes marked by this CLI.

Recommended naming:

```bash
/path/to/profiles/chromium-main
/path/to/profiles/chrome-main
```

## Extensions

Chromium supports unpacked extensions through this wrapper:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-ext-profile" --extension-path "/path/to/ext"
```

Chrome is different:

- Current Chrome builds do not reliably support this workflow purely via startup flags.
- For stock Chrome, use a persistent profile and install the extension manually through `chrome://extensions/`.
- Reuse that same Chrome profile on later runs.

## Important limits

- Treat the stealth/profile/extension additions as targeting browser-driving CLI commands.
- `playwright-stealth test` still exposes upstream Playwright Test, but should not be treated as automatically inheriting this wrapper's stealth behavior.
- If a user specifically needs browser extensions in Chrome, recommend a persistent Chrome profile and manual installation.
- Agents using this CLI should fully close the browser when done.
- Agents should periodically check `playwright-stealth profile-list` for leftover browser processes.

## Good examples

```bash
# one-off login test
playwright-stealth open https://x.com/i/flow/login

# persistent Chromium login profile
playwright-stealth open --profile-dir "/path/to/chromium-login" https://x.com/i/flow/login

# persistent Chrome login profile
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-login" https://x.com/i/flow/login

# Chromium with unpacked extension
playwright-stealth open --profile-dir "/path/to/chromium-ext" --extension-path "/path/to/ext"
```

## Reference

- Main README: [`README.md`](../../README.md)
- Chinese README: [`README.zh-CN.md`](../../README.zh-CN.md)
