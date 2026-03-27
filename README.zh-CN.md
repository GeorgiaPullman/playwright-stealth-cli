# playwright-stealth-cli

[English](./README.md) | 简体中文

`playwright-stealth-cli` 是基于 [`microsoft/playwright-cli`](https://github.com/microsoft/playwright-cli) 的一层轻量封装；它在 npm 上对应的上游包是 `@playwright/cli`。本项目尽量原样保留那套终端命令能力，同时补充了这些增强：

- 默认启用 `puppeteer-extra-plugin-stealth`
- 默认使用临时 profile，适合一次性运行
- 支持显式指定持久化 profile
- 支持在 Chromium 中通过命令行加载 unpacked 扩展

安装后的命令名是：

```bash
playwright-stealth
```

相关链接：

- [English README](./README.md)
- [Skill 文件](./skills/playwright-stealth-cli/SKILL.md)

## 作为全局命令使用

全局安装：

```bash
npm install -g playwright-stealth-cli
```

安装后直接执行：

```bash
playwright-stealth open https://example.com
```

也可以用 `npx`：

```bash
npx playwright-stealth-cli open https://example.com
```

常用示例：

默认运行：

```bash
playwright-stealth open https://x.com/i/flow/login
```

使用持久化 Chromium profile：

```bash
playwright-stealth open --profile-dir "/path/to/chromium-profile" https://x.com/i/flow/login
```

使用原版 Chrome：

```bash
playwright-stealth open --channel chrome https://x.com/i/flow/login
```

单次关闭 stealth：

```bash
playwright-stealth open --disable-stealth https://example.com
```

显式使用临时 profile：

```bash
playwright-stealth open --temp-profile https://example.com
```

在 Chromium 中通过命令行加载 unpacked 扩展：

```bash
playwright-stealth open --profile-dir "/path/to/chromium-ext-profile" --extension-path "/path/to/extension"
```

列出当前正在运行的浏览器/profile：

```bash
playwright-stealth profile-list
```

机器可读 JSON 输出：

```bash
playwright-stealth profile-list --json
```

检查某个 profile 是否正在被使用：

```bash
playwright-stealth profile-status "/path/to/chromium-profile"
```

机器可读 JSON 输出：

```bash
playwright-stealth profile-status "/path/to/chromium-profile" --json
```

注意：

- `profile-list` 现在会从上游 session registry 中列出当前活跃的受管会话。
- `profile-status` 会检查某个 profile 是否正被这些活跃会话占用。

## 默认行为

- 默认启用 stealth
- 默认使用临时 profile
- 临时 profile 会创建在系统临时目录下
- 启动时会尽量清理旧的 `playwright-cli-profile-*` 临时目录

也就是说，默认行为更适合临时浏览器自动化；如果涉及登录态、扩展复用或长期状态，建议显式指定持久化 profile。

## 持久化 Profile

对于登录流程、扩展复用和长期浏览器状态，强烈建议显式指定持久化 profile：

```bash
playwright-stealth open --profile-dir "/path/to/chromium-main" https://x.com/i/flow/login
```

如果使用 Chrome：

```bash
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-main" https://x.com/i/flow/login
```

重要说明：

- 不要让 Chrome 和 Chromium 共用同一个 profile 目录
- Chrome 和 Chromium 应该分别使用独立目录
- 混用时可能导致启动崩溃或行为异常

推荐命名：

- Chromium：`.../profiles/chromium-main`
- Chrome：`.../profiles/chrome-main`

如果你尝试启动一个疑似已经被占用的 profile，CLI 会先询问是否继续。
如果你明确要跳过该确认，可以使用：

```bash
playwright-stealth open --profile-dir "/path/to/chromium-main" --force-profile
```

## 扩展程序

Chromium 可以通过命令行直接加载 unpacked 扩展：

```bash
playwright-stealth open --profile-dir "/path/to/chromium-ext-profile" --extension-path "/path/to/ext"
```

对于 Chromium，如果扩展加载成功，通常可以直接访问扩展页面 URL。

Chrome 则不同：

- 在当前版本的 Chrome 中，单纯依赖启动参数加载 unpacked 扩展并不稳定
- 如果要在原版 Chrome 中使用扩展，必须使用持久化 Chrome profile，并在该 profile 中手动安装扩展

推荐流程：

1. 用持久化 profile 启动 Chrome
2. 打开 `chrome://extensions/`
3. 手动安装扩展
4. 后续继续复用同一个 profile

示例：

```bash
playwright-stealth open --channel chrome --profile-dir "/path/to/chrome-ext-profile"
```

## 命令兼容性

本项目把用户侧的终端命令直接委托给 `@playwright/cli`，而不是手动重写一套命令解析。这也是它能随着上游更新而更新的关键。

保留下来的上游命令族包括：

- Core：`open`、`close`、`goto`、`type`、`click`、`dblclick`、`fill`、`drag`、`hover`、`select`、`upload`、`check`、`uncheck`、`snapshot`、`eval`、`dialog-accept`、`dialog-dismiss`、`resize`、`delete-data`
- Navigation：`go-back`、`go-forward`、`reload`
- Keyboard：`press`、`keydown`、`keyup`
- Mouse：`mousemove`、`mousedown`、`mouseup`、`mousewheel`
- Save as：`screenshot`、`pdf`
- Tabs：`tab-list`、`tab-new`、`tab-close`、`tab-select`
- Storage：`state-load`、`state-save`、`cookie-*`、`localstorage-*`、`sessionstorage-*`
- Network / DevTools：`route`、`route-list`、`unroute`、`console`、`run-code`、`network`、`tracing-*`、`video-*`、`show`、`devtools-start`
- 安装与会话管理：`install`、`install-browser`、`list`、`close-all`、`kill-all`

本项目额外新增：

- `profile-list`
- `profile-status`

需要特别注意：

- 这里对齐的是 `microsoft/playwright-cli` 这套终端命令，不是 npm `playwright` test runner CLI。
- `playwright-stealth` 的定位是保留 `microsoft/playwright-cli` 的命令式工作流，并在外层增加 stealth / profile / extension 能力。

## 作为项目开发时的注意事项

本地开发时可以这样运行：

```bash
npm install
node ./cli.js open https://example.com
```

运行 smoke test：

```bash
npm test
```

`package.json` 中使用了 `files` 白名单，所以本地开发产物例如 `artifacts/`、`scripts/`、`test/` 不会被发布到 npm。

操作建议：

- 用完浏览器后，尽量彻底关闭它。
- 如果是 agent 或脚本长期使用，建议定期执行 `playwright-stealth profile-list` 检查是否还有残留浏览器进程。
- 不同工作流或不同账号，最好分别使用独立的持久化 profile，避免争用。

## 上游升级说明

这个项目的设计目标之一，就是让大多数上游命令更新主要通过升级 `@playwright/cli` 来获得，而不是再次手动复制整套命令。

实际含义是：

- 用户看到的终端命令集通常会自动跟着上游走。
- 上游新增命令或调整 help 输出时，通常不需要重写这层封装。
- 本地代码主要只处理参数归一化、profile 管理，以及 daemon / browser 启动时的增强注入。

不过它仍然是基于部分上游内部模块的薄封装，所以升级并不是绝对零风险。

通常只升级包就足够的情况：

- 命令覆盖范围变化
- help 文案变化
- 轻量 CLI 行为调整

仍可能需要少量本地适配的情况：

- 上游内部文件路径变化
- session 配置结构变化
- daemon 启动流程变化
- browser context factory 行为变化
- config 解析内部实现变化

推荐的升级流程：

1. 升级 `@playwright/cli`
2. 运行 `npm test`
3. 检查 `playwright-stealth --help`
4. 检查 `playwright-stealth open --help`
5. 跑一条基础浏览器链路，例如 `open -> goto -> close-all`
6. 再验证我们自定义的增强能力，例如 stealth、持久化 profile、`--extension-path`
