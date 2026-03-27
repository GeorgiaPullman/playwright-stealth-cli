name: playwright-stealth-cli
description: Uses playwright-stealth-cli, a thin wrapper around microsoft/playwright-cli (@playwright/cli), for any task that needs browser operations or browser automation. Use when Codex needs to open a browser, navigate, click, fill, inspect, capture, manage tabs, storage, or network, or otherwise drive a browser session, while preferring branded Chrome and choosing persistent or temporary profiles based on the task.
allowed-tools: Bash

# Browser Automation with playwright-stealth-cli

## When to use

Use this skill when the user wants:

- any browser operation or browser automation task
- the terminal command style from `microsoft/playwright-cli`
- commands such as `open`, `goto`, `click`, `fill`, `upload`, `snapshot`, `tab-*`, `cookie-*`, `localstorage-*`, `network`, `run-code`, or `close-all`
- default branded Chrome
- persistent profiles when needed
- temporary profiles for isolated runs
- unpacked Chromium extension loading

## Upstream compatibility

This wrapper is intentionally built as a thin layer around `@playwright/cli`, which is the npm package for `microsoft/playwright-cli`.

That matters for two reasons:

- the upstream terminal command set stays intact instead of being reimplemented by hand
- upstream updates can be adopted by upgrading `@playwright/cli`, without rewriting the whole command surface here

## Command name

The package name is `playwright-stealth-cli`, but the installed command is:

```bash
playwright-stealth
```

Local development entry point:

```bash
node ./cli.js
```

## Default runtime

Default browser and profile strategy:

```bash
playwright-stealth open --channel chrome https://example.com
```

Prefer branded Chrome by default. Choose a persistent profile for login flows or long-lived state, and choose a temporary profile for isolated one-off runs unless the user asks for something specific.

## Upstream command set

This wrapper keeps the upstream command families from `microsoft/playwright-cli`.

Core:

- `open`
- `close`
- `goto`
- `type`
- `click`
- `dblclick`
- `fill`
- `drag`
- `hover`
- `select`
- `upload`
- `check`
- `uncheck`
- `snapshot`
- `eval`
- `dialog-accept`
- `dialog-dismiss`
- `resize`
- `delete-data`

Navigation:

- `go-back`
- `go-forward`
- `reload`

Keyboard:

- `press`
- `keydown`
- `keyup`

Mouse:

- `mousemove`
- `mousedown`
- `mouseup`
- `mousewheel`

Save as:

- `screenshot`
- `pdf`

Tabs:

- `tab-list`
- `tab-new`
- `tab-close`
- `tab-select`

Storage:

- `state-load`
- `state-save`
- `cookie-list`
- `cookie-get`
- `cookie-set`
- `cookie-delete`
- `cookie-clear`
- `localstorage-list`
- `localstorage-get`
- `localstorage-set`
- `localstorage-delete`
- `localstorage-clear`
- `sessionstorage-list`
- `sessionstorage-get`
- `sessionstorage-set`
- `sessionstorage-delete`
- `sessionstorage-clear`

Network:

- `route`
- `route-list`
- `unroute`
- `network`

DevTools and debugging:

- `console`
- `run-code`
- `tracing-start`
- `tracing-stop`
- `video-start`
- `video-stop`
- `show`
- `devtools-start`

Install and sessions:

- `install`
- `install-browser`
- `list`
- `close-all`
- `kill-all`

Wrapper-only additions:

- `profile-list`
- `profile-status`

## Wrapper defaults and extras

- Prefer branded Chrome via `--channel chrome` for normal runs.
- Choose persistent profiles when the task benefits from saved login state or long-lived browser state.
- Choose temporary profiles when the user wants an isolated one-off session.
- Stealth is enabled by default for Chromium.
- Old `playwright-cli-profile-*` temp folders are cleaned up on startup when possible.
- `--profile-dir` is an alias for an explicit persistent profile.
- `--channel` is an alias of upstream `--browser`.
- `--extension-path` loads unpacked Chromium extensions.
- `--force-profile` skips the profile-in-use confirmation.

## Tabs and popups

When a site opens a new tab, popup, or login window, this CLI handles it through the upstream tab commands.

Important behavior:

- use `tab-list` to inspect current tabs
- use `tab-select <index>` to switch the active tab
- subsequent commands operate on the currently selected tab
- there is no separate Selenium-style window handle API here; the normal switching model is tab index based

Good pattern after a click that opens a new page:

```bash
playwright-stealth click r12
playwright-stealth tab-list
playwright-stealth tab-select 1
playwright-stealth snapshot
```

## Profile rules

- Pick a profile path intentionally for login flows and long-lived state instead of assuming a single fixed default path.
- Keep Chrome and Chromium profiles separate.
- Do not reuse the same profile directory between Chrome and Chromium.
- The CLI can list active browser/profile pairs with `playwright-stealth profile-list`.
- The CLI can emit machine-readable output with `playwright-stealth profile-list --json`.
- The CLI can check a specific profile with `playwright-stealth profile-status "/path/to/profile"`.
- If a profile appears busy, the CLI will ask before continuing unless `--force-profile` is used.

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

## Good examples

```bash
# default: branded Chrome
playwright-stealth open --channel chrome https://example.com

# use Chrome with a persistent profile
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-main" https://example.com

# open then drive with upstream commands
playwright-stealth open https://example.com
playwright-stealth snapshot
playwright-stealth click r12
playwright-stealth fill r17 "hello"

# Chromium with unpacked extension
playwright-stealth open --profile-dir "/path/to/chromium-ext" --extension-path "/path/to/ext"
```

## Agent guidance

- Use the upstream terminal commands directly when they already express the workflow.
- Do not claim a command is unavailable if it is part of the upstream command set listed above.
- For input flows, it is acceptable to trigger a focus action after typing or filling when that makes the interaction more reliable.
- If a task requires logic that the CLI command language still cannot express cleanly, switch to Playwright code only for that part.
- Fully close the browser when done.
- Periodically run `playwright-stealth profile-list` to check for leftover browser processes.

## Reference

- Main README: [`README.md`](../../README.md)
- Chinese README: [`README.zh-CN.md`](../../README.zh-CN.md)
