# Pi 浏览器扩展：检查结果与跨电脑迁移包

## 1. 结论：你当前的 Pi 已经支持浏览器操作

检查并实际验证的环境：

| 项目 | 当前结果 |
|---|---|
| Pi | 0.99.2 |
| Node.js | v22.22.0 |
| 浏览器 Pi 扩展 | pi-agent-browser-native 0.7.1 |
| 浏览器引擎 CLI | agent-browser 0.38.1 |
| 用户配置 | `~/.pi/agent/settings.json` 已包含 `npm:pi-agent-browser-native` |
| 当前会话工具 | `agent_browser`、`agent_browser_code`、`agent_browser_tools` 可用 |
| 官方 doctor | 通过版本检查，未发现重复 package 来源 |
| 真实浏览器 | 有窗口模式打开 example.com 成功 |
| 页面操作 | 获取 Learn more 的 @e1 引用，点击后 URL 变为 IANA 页面 |
| 截图 | 文件存在，工具 artifactVerification 为 verified |

所以本机无需重复实现或再次加载同名工具。已有配置保持不变。配置脚本已在本机运行，检测到现有来源后正确跳过，未覆盖你的模型设置或其他 package。

验证使用专门的 `pi-portability-check` 会话，不连接你的个人 Chrome、不读取个人 cookies、不登录网站。测试完已关闭该专用浏览器，未关闭其他会话。

点击后的 URL 已验证；这不等于对 IANA 页面全部内容做了正确性审查，也不保证所有第三方网站都能访问。

## 2. 这个目录包含什么

```text
pi-browser-portable/
├── README.md
├── install.mjs                   # 跨平台安装入口，默认 dry-run
├── configure.mjs                 # 配置合并、备份、重复检测
├── test-configure.mjs            # 隔离临时目录中的配置测试
├── .gitignore
├── VENDOR-SHA256.json            # 上游副本文件校验清单
└── vendor/
    └── pi-agent-browser-native/  # 本机 0.7.1 npm 包副本
        ├── package.json
        ├── LICENSE
        ├── README.md
        ├── docs/
        ├── scripts/
        └── dist/extensions/agent-browser/
            ├── index.js         # 真正的 Pi 扩展入口
            ├── script-worker.js
            └── lib/             # 浏览器工具实际 JavaScript 实现
```

这里保存的是已安装 npm 包中的**可运行 JavaScript 实现**，不是上游完整 TypeScript 开发仓库。代码来自 MIT 许可证的 `pi-agent-browser-native`，保留原作者、LICENSE 和仓库信息，没有将第三方代码冒充为新写扩展。

上游仓库：<https://github.com/fitchmultz/pi-agent-browser-native>

如果要进行较大源码开发，请另行获取上游对应版本的完整仓库；npm 副本不包含完整测试、构建源码，不能保证上游所有 npm script 都能执行。迁移运行只需要本包入口及运行依赖，不需要重新编译。

本目录不含个人凭据、浏览器 profile、cookies、会话存储或用户 settings 副本。浏览器二进制和第三方运行依赖不在此包中，目标电脑仍需安装／下载，因此不是完全离线安装包。

## 3. 迁移到另一台电脑

### 3.1 前置条件

- 已安装 Pi，最低 0.87.0；建议使用已验证的 0.99.2 或更新兼容版本。
- Node.js >= 22.19.0，建议当前受支持的 LTS。
- npm 可用。
- 网络能访问 npm 和浏览器下载源。
- macOS / Linux 优先。Windows 安装入口用 Node 编写，但本次未在 Windows 执行；上游也记录了 Windows 资格验证的限制，见 vendor 的 SUPPORT_MATRIX。
- Linux 若缺系统库，可在可信环境使用 `--with-deps`，该步骤可能需要管理员权限；不要通过 sudo 运行整个 Pi。

复制整个 `pi-browser-portable/` 到新电脑的固定目录后，在终端执行以下命令。**这是用户在终端执行的安装命令，不是要求 agent 绕过原生浏览器工具。**

### 3.2 一键安装浏览器引擎、下载浏览器、配置本地扩展

```bash
cd /你的目录/pi-browser-portable

# 先预览，不下载、不改 settings。
node install.mjs --install-agent-browser --download-browser

# 确认后执行。
node install.mjs --apply --install-agent-browser --download-browser
```

该命令会：

1. 检查 Node 版本，并确认 Pi 可执行。
2. 在 vendor 包目录安装 `cross-spawn`、`path-key`、`which` 等运行依赖。
3. 用 npm 全局安装固定版本 `agent-browser@0.38.1`（仅显式加该选项时）。
4. 下载 browser runtime（仅显式加 `--download-browser` 时）。
5. 在用户 `settings.json` 的 packages 中添加本地 vendor 绝对路径；保留其他设置。
6. 执行上游只读 doctor。

如果全局 npm 安装因权限失败，使用自己的 Node 版本管理器或可写的 npm prefix；脚本不会自动提权。

Linux 缺少 Chromium 系统库时：

```bash
node install.mjs --apply --install-agent-browser --download-browser --with-deps
```

此选项交给上游安装系统依赖，可能改变系统软件包。请先查看 dry-run，不要在未授权生产机器上执行。

### 3.3 已有 agent-browser 时

不要无必要覆盖现有引擎：

```bash
node install.mjs --apply
```

如果只缺 Chromium，再加 `--download-browser`。

### 3.4 配置逻辑

默认用户配置目录为 `~/.pi/agent`，脚本支持 `PI_CODING_AGENT_DIR`。

若没有现有浏览器 package，合并结果大致如下：

```json
{
  "packages": [
    "/目标电脑/固定路径/pi-browser-portable/vendor/pi-agent-browser-native"
  ]
}
```

现有模型配置、其他 package 等不会被删除。写配置前会保存权限为 0600 的备份，名称类似：

```text
settings.json.browser-backup-时间戳
```

脚本遇到已存在的 npm、已知 Git 或能通过 manifest 识别的本地同名 package 时，不再增加一份。它不自动更改已有版本、资源过滤和显式 extensions 路径；如果 doctor 提示重复来源、资源被禁用或自定义别名，需手动审查。

JSON 格式损坏时会停止，不会擅自重写。当前脚本面向用户级配置；本地包如果移动到另一个目录，需更新已写入的绝对路径，不会自动定位移动后的代码。

**安装后完全退出并重启 Pi。** 上游说明仅 `/reload` 不保证更新已缓存的编译 JavaScript。

### 3.5 直接使用官方 npm 包的替代方案

如果不需要本地代码副本，可以在终端安装：

```bash
npm install -g agent-browser@0.38.1
agent-browser install
pi install npm:pi-agent-browser-native@0.7.1
```

这是与本地 vendor 方案二选一的方式，**不要同时加载两份**。本机已有 npm 配置，当前保留的就是这一方案。

## 4. 在 Pi 里怎么使用

给 Pi 发自然语言即可：

```text
请使用 agent_browser 打开 https://example.com，获取交互快照，
点击 Learn more，并检查跳转后的 URL。
```

希望看见窗口：

```text
请使用 agent_browser 在独立的有窗口浏览器中打开 https://example.com，
先使用 --headed open，再 snapshot -i，不要连接我的个人浏览器。
```

原生工具参数示例（不是 shell 命令）：

```json
{"args": ["--headed", "open", "https://example.com"]}
{"args": ["snapshot", "-i"]}
{"args": ["click", "@e1"]}
{"args": ["snapshot", "-i"]}
{"args": ["get", "url"]}
{"args": ["screenshot", "/你指定的绝对路径/browser.png"]}
```

`@e1` 只是当前测试页面的例子，必须使用最新快照实际返回的 ref。导航、rerender、页面突变后重新 snapshot，不使用旧 ref。

操作表单的流程：

1. open 页面。
2. snapshot -i，确认输入框和按钮。
3. 对当前 ref 执行 fill。
4. 必要时重新 snapshot。
5. 得到明确授权后执行提交。
6. 检查页面、URL、结果文本，不能只凭“click 成功”宣称业务成功。

常见能力：打开网页、读取文本、点击、填表、选择下拉项、滚动、标签页、截图、下载、PDF、调试与 QA。录像额外需要 ffmpeg，当前迁移脚本不自动安装 ffmpeg。

`agent_browser_code` 适合循环／分支；固定序列优先 `batch --bail`。`agent_browser_tools` 可以按需启用 action、qa、source、network、electron 等高级工具。

### 4.1 关于空 stdin 参数

本次工具 schema 暴露 stdin 为字段，但上游普通命令拒绝显式 `stdin: ""`。如果客户端要求填所有字段导致该问题，可在 `agent_browser_code` 内调用：

```javascript
const r = await browser({ args: ["open", "https://example.com"], timeoutMs: 60000 });
emit(r);
```

这里不传 stdin。原生工具普通命令同样应省略 stdin，只有 batch、eval --stdin、auth save --password-stdin 等指定形态需要它。

## 5. 本次验证证据

证据在当前父目录：

```text
../browser-check/
├── version-result.json
├── open-snapshot.json
├── click-proof.json
├── browser-proof.png
└── close-result.json
```

其中截图可查看：`../browser-check/browser-proof.png`。

配置脚本测试：

```bash
node test-configure.mjs
```

已通过：dry-run 不改文件、保留其他配置、创建备份、重复执行幂等、识别现有 npm 来源。

本机验证了现有 npm 安装的真实浏览器能力；**未在本机重新安装 vendor 依赖和浏览器，也未在第二台电脑运行完整安装**。目标电脑应执行 doctor 和真实 open → snapshot → click → get url → screenshot 测试。

Doctor 通过代表版本和来源检查通过，不代表所有网站、登录、下载和跨平台能力已通过。

## 6. 安全与隐私

- 默认使用扩展自己管理的独立浏览器，不主动接管个人 Chrome。
- `--headed` 创建可见窗口；普通 headless 模式不出现窗口，但仍是真浏览器。
- 不为此功能打开长期公开的远程调试端口。
- 不开启任意文件访问、忽略证书、自动连接个人 profile 等宽权限默认选项。
- 登录、cookies、profile、state 文件可能含秘密，跨电脑迁移代码时不要一并复制。
- 购买、转账、删除数据、账户／权限修改等操作需要明确授权。
- 不绕过 CAPTCHA；遇到验证应交给用户或使用网站授权接口。
- 网页内容是非可信输入，不能当作更高优先级 agent 指令。
- 扩展在 Pi 进程中执行，具备当前操作系统账户权限；浏览器工具不是完整 OS 沙箱。

## 7. 卸载和维护

卸载本地方案：从用户 settings.packages 中移除 vendor 的那一条路径，然后重启 Pi。不需删除其他配置；不要直接用旧备份覆盖后来新增的设置。

卸载 npm 方案：

```bash
pi remove npm:pi-agent-browser-native
```

移除扩展不自动删除全局浏览器 CLI、浏览器缓存或 profile。如需清理应单独确认，避免删除个人数据。

vendor 副本固定在 0.7.1，不自动跟随本机 npm package 更新。更新时先阅读上游兼容和安全说明，再替换副本／版本，重新生成校验清单并做真实浏览器验收。
