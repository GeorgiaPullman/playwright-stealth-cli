# playwright-stealth-cli

[English](./README.md) | 简体中文

`playwright-stealth-cli` 是基于官方 Playwright CLI 的一层轻量封装。它尽量保留上游命令能力，同时补充了这些增强：

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

注意：

- `profile-list` 现在只会列出带有本项目内部标记的受管浏览器进程。
- 这样后续筛选或清理时会更安全，不会把系统里其他 Chromium 内核程序混进来。

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

## 适用范围

这个封装主要面向 Playwright CLI 中“直接驱动浏览器”的命令，例如：

- `open`
- `codegen`
- `screenshot`
- `pdf`
- `cr`
- `ff`
- `wk`

由于本项目是委托官方 CLI 程序执行，而不是 fork 一整套 CLI，所以原版 Playwright CLI 的命令面大体仍然保留。

但要特别注意：

- `playwright-stealth test` 仍然会暴露上游 Playwright Test 的命令入口
- 不要假设 `playwright test` 会自动继承本项目的 stealth/profile/extension 行为
- 这些增强主要应当理解为作用于上面列出的浏览器驱动类命令

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
