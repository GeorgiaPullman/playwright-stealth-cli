# playwright-stealth-cli

English | [简体中文](./README.zh-CN.md)

`playwright-stealth-cli` is a thin wrapper around [`microsoft/playwright-cli`](https://github.com/microsoft/playwright-cli), published on npm as `@playwright/cli`. It keeps that upstream terminal command surface intact while adding:

- `puppeteer-extra-plugin-stealth` enabled by default
- temporary-profile defaults for safer one-off runs
- explicit persistent profile controls
- unpacked Chromium extension loading

The installed command name is:

```bash
playwright-stealth
```

Related resources:

- [Chinese README](./README.zh-CN.md)
- [Skill file](./skills/playwright-stealth-cli/SKILL.md)

## Global Usage

Install globally:

```bash
npm install -g playwright-stealth-cli
```

Then run:

```bash
playwright-stealth open https://example.com
```

You can also use it with `npx`:

```bash
npx playwright-stealth-cli open https://example.com
```

Common examples:

Default run:

```bash
playwright-stealth open https://x.com/i/flow/login
```

Use a persistent Chromium profile:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-profile" https://x.com/i/flow/login
```

Use stock Chrome:

```bash
playwright-stealth open --channel chrome https://x.com/i/flow/login
```

Disable stealth for one run:

```bash
playwright-stealth open --disable-stealth https://example.com
```

Use a temporary profile explicitly:

```bash
playwright-stealth open --temp-profile https://example.com
```

Load an unpacked extension in Chromium:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-ext-profile" --extension-path "/path/to/extension"
```

List running browser/profile pairs:

```bash
playwright-stealth profile-list
```

Machine-readable output:

```bash
playwright-stealth profile-list --json
```

Check whether a profile is already in use:

```bash
playwright-stealth profile-status "/path/to/chromium-profile"
```

Machine-readable status:

```bash
playwright-stealth profile-status "/path/to/chromium-profile" --json
```

Note:

- `profile-list` reports active wrapper-managed sessions from the upstream session registry.
- `profile-status` checks whether a profile is in use by one of those active sessions.

## Defaults

- Stealth is enabled by default.
- A temporary profile is used by default.
- Temporary profiles are created under the system temp directory.
- Old `playwright-cli-profile-*` temp folders are cleaned up on startup when possible.

This means the default behavior is friendly for ad-hoc browser automation, but real login flows usually work better with an explicit persistent profile.

## Persistent Profiles

For login flows, extension reuse, and long-lived browser state, strongly prefer an explicit persistent profile:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-main" https://x.com/i/flow/login
```

For Chrome:

```bash
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-main" https://x.com/i/flow/login
```

Important:

- Do not reuse the same profile directory between Chrome and Chromium.
- Keep Chrome profiles and Chromium profiles in separate directories.
- Mixing them can cause crashes or unstable behavior.

Recommended naming:

- Chromium: `.../profiles/chromium-main`
- Chrome: `.../profiles/chrome-main`

If you try to start a profile that appears to already be in use, the CLI will ask whether to continue.
You can skip that confirmation with:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-main" --force-profile
```

## Extensions

Chromium supports loading unpacked extensions through CLI flags in this wrapper:

```bash
playwright-stealth open --profile-dir "/path/to/chromium-ext-profile" --extension-path "/path/to/ext"
```

For Chromium, a successfully loaded extension can usually be opened directly via its extension URL.

Chrome is different:

- In current Chrome versions, loading unpacked extensions purely from startup command line flags is not reliable in this workflow.
- If you want to use stock Chrome with extensions, use a persistent Chrome profile and install the extension manually inside that profile.

Recommended Chrome extension workflow:

1. Start Chrome with a persistent profile.
2. Open `chrome://extensions/`.
3. Manually install the extension into that profile.
4. Reuse that same profile in later runs.

Example:

```bash
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-ext-profile"
```

## Command Compatibility

This wrapper delegates user-facing terminal commands to `@playwright/cli` instead of reimplementing them by hand. That is how it can follow upstream updates with minimal local code changes.

The upstream command families are preserved, including:

- Core: `open`, `close`, `goto`, `type`, `click`, `dblclick`, `fill`, `drag`, `hover`, `select`, `upload`, `check`, `uncheck`, `snapshot`, `eval`, `dialog-accept`, `dialog-dismiss`, `resize`, `delete-data`
- Navigation: `go-back`, `go-forward`, `reload`
- Keyboard: `press`, `keydown`, `keyup`
- Mouse: `mousemove`, `mousedown`, `mouseup`, `mousewheel`
- Save as: `screenshot`, `pdf`
- Tabs: `tab-list`, `tab-new`, `tab-close`, `tab-select`
- Storage: `state-load`, `state-save`, `cookie-*`, `localstorage-*`, `sessionstorage-*`
- Network and DevTools: `route`, `route-list`, `unroute`, `console`, `run-code`, `network`, `tracing-*`, `video-*`, `show`, `devtools-start`
- Install and session management: `install`, `install-browser`, `list`, `close-all`, `kill-all`

Wrapper-only additions:

- `profile-list`
- `profile-status`

Important:

- This is not based on the npm `playwright` test runner CLI.
- `playwright-stealth` is meant to preserve the `microsoft/playwright-cli` terminal workflow and add stealth/profile/extension behavior around it.

## Local Development

Clone the project, install dependencies, and use the local entry point:

```bash
npm install
node ./cli.js open https://example.com
```

Run the smoke tests:

```bash
npm test
```

Operational advice:

- Fully close the browser when you are done with a profile.
- If you automate this CLI from an agent or script, periodically run `playwright-stealth profile-list` to check for leftover browser processes.
- Prefer separate persistent profiles per workflow or account to avoid accidental profile contention.

## Upgrading Upstream

This project is designed so that most upstream command changes come from upgrading `@playwright/cli`, rather than manually copying commands again.

In practice that means:

- The user-facing terminal command set usually follows upstream automatically.
- Upstream additions to commands and help output usually do not require rewriting this wrapper.
- Our local code mainly patches argument normalization, profile handling, and daemon/browser launch behavior.

However, this is still a thin wrapper around some upstream internal modules, so upgrades are not completely zero-risk.

Usually, a package upgrade is enough when upstream only changes:

- command coverage
- help text
- minor CLI behavior

You should still expect a small compatibility fix if upstream changes:

- internal file paths
- session config structure
- daemon startup flow
- browser context factory behavior
- config parsing internals

Recommended upgrade flow:

1. Upgrade `@playwright/cli`.
2. Run `npm test`.
3. Verify `playwright-stealth --help`.
4. Verify `playwright-stealth open --help`.
5. Run a basic browser flow such as `open -> goto -> close-all`.
6. Re-check wrapper-specific features such as stealth, persistent profiles, and `--extension-path`.

Publishable package files are restricted in `package.json` via the `files` field, so local development artifacts like `artifacts/`, `scripts/`, and `test/` are not uploaded to npm.
