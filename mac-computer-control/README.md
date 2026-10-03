# macOS 电脑屏幕与鼠标键盘控制扩展

## 目标与实现

让 Pi Agent 完成“看屏幕 → 根据用户要求定位 → 鼠标键盘操作 → 再看屏幕验证”的循环。

- `mac_screen` 返回主屏幕 PNG、中文／英文 OCR 文本和位置。
- 模型结合截图、OCR 与用户提示词定位目标；不是本地独立视觉模型。
- `mac_input` 支持移动鼠标、左右单击／双击、垂直滚动、中文／英文文本输入与快捷键。
- 使用 macOS CoreGraphics 发送输入，Vision 做 OCR，不需要 cliclick、Python 或云端 OCR 服务。
- 仅 macOS 本机交互 TUI；默认关闭，每次输入操作都要求确认。

需要当前模型支持工具结果图片，才能可靠看图。没有视觉能力的模型只能尝试利用 OCR，不适合操作无法辨认的图标。

## 文件

```text
mac-computer-control/
├── index.ts       # Pi 扩展，两个 Agent 工具和一个用户命令
├── native.swift   # 完整原生辅助程序源码
├── build.mjs      # Swift 编译、ad-hoc 签名
├── install.mjs    # 跨 Mac 复制、在目标安装目录编译
├── test.mjs       # 离线逻辑测试，绝不发送真实输入
├── README.md
└── bin/mac-computer-helper  # 当前 Mac 的本地构建产物，不需迁移
```

Pi 提供 TypeScript 加载器及 `typebox`。运行本扩展不需要额外 npm 依赖。

## 当前电脑配置与首次使用

已构建原生程序，并建立用户扩展目录软链接：

```text
~/.pi/agent/extensions/mac-computer-control
→ /Users/harden/python/extend/mac-computer-control
```

先 `/reload` 或重启 Pi。

```text
/mac-computer status
/mac-computer on
/mac-computer off
```

`on` 会先提示屏幕隐私风险，再检查权限；权限缺失时不会开启。

**本机首次检查结果：屏幕录制 false，辅助功能 false。** 没有实际截图或发送输入。权限需要你手动授予。

### macOS 权限

1. 打开“系统设置 → 隐私与安全性 → 屏幕与系统音频录制”（不同系统版本可能叫“屏幕录制”）。
2. 为运行 Pi 的终端应用授权，如 Terminal／终端、iTerm2，或你实际使用的 IDE。
3. 打开“隐私与安全性 → 辅助功能”，授权同一个宿主。
4. 如果权限仍为 false，或系统提示直接针对 helper，在列表中添加并授权已编译的 `bin/mac-computer-helper`。可在文件选择窗口按 Command+Shift+G 粘贴完整路径。
5. 完全退出并重新打开宿主终端和 Pi，再执行 `/mac-computer status`。
6. 两项为 true 后 `/mac-computer on`。

macOS TCC 的权限归属会随启动链和系统版本变化。不要用修改 TCC 数据库、关闭 SIP 或运行 sudo 的方式绕过；本扩展不这样做，也不自动申请权限。

可单独只读检查：

```bash
./bin/mac-computer-helper status
```

启用只是允许工具工作，并不会自动开始读取屏幕。

### 建议验收提示词

先在主屏幕手动打开一个空白的 TextEdit 文档，并把文档窗口放在屏幕上。

> 使用 mac_screen 查看主屏幕，找到 TextEdit 文档的编辑区域。先告诉我准备点击的位置，经我确认后点击。重新截图，然后输入“你好，这是电脑控制测试”，不要发送回车或保存文件。最后再截图验证文字是否出现。

模型会使用工具，每次点击和输入都会在 Pi 中弹出确认。确认对话框会列出目标应用、理由和实际参数。**输入文字会显示在确认框中，不应包含密码或其他秘密。**

看图时 Pi 的终端可能遮挡目标。请把目标窗口放在终端旁边，或手动切到目标应用后再等待 Agent 截图。确认后 helper 会恢复截图时的前台应用，避免将输入误打进 Pi 终端。

## 在其他 Mac 使用

复制整个目录，不依赖本机绝对路径。需要 Pi、Node.js 和 Xcode Command Line Tools。

若没有编译工具，用户手动执行：

```bash
xcode-select --install
```

安装：

```bash
cd mac-computer-control
node install.mjs            # 只预览
node install.mjs --apply    # 复制到用户扩展目录，在那里重新编译
```

安装器不会覆盖已有目录，不修改 settings.json 或 macOS 权限。`PI_CODING_AGENT_DIR` 可指定其他 Pi 用户目录。

临时开发试用：

```bash
node build.mjs
pi --no-extensions -e ./index.ts
```

不能仅复制 `index.ts`，它依赖同目录的 native helper。迁移时重新编译以适配 Intel／Apple Silicon，不复用未经验证的旧二进制。编译重新签名后 macOS 可能要求再次授权。

不要同时通过软链接、settings 包路径和 `-e` 加载多份扩展。

## 工具参数与坐标

### mac_screen

参数 `{}`。返回：

- 缩放到最多 1280 像素宽的 PNG。
- `screenshotId`，一次操作凭证，最多有效 2 分钟。
- 屏幕逻辑 point 宽高、displayId、前台应用名及 PID。
- `imageWidth`、`imageHeight`。
- 最多 200 个 OCR 项：文字、置信度、中心坐标、宽高。
- `ocrFailed`：OCR 失败仍可以用截图视觉定位，不要把缺失 OCR 当成没有目标。

**所有点击坐标使用 [0,1) 归一化比例，原点为主屏幕左上角。**

例如图中目标位于宽度 40%、高度 60%，传 `x: 0.4, y: 0.6`。不要把模型界面缩放后的图像像素直接传成坐标。OCR 的 x、y 已经是同一套比例；width、height 也是归一化值。

系统 helper 将比例转为显示器逻辑 point，因此处理 Retina 像素比例时不需要模型自行除以 2。

当前只有主屏幕，不支持第二显示器坐标、局部截图或跨屏拖拽。将需要操作的窗口先放到主屏幕。

### mac_input

共同参数：`screenshotId`、`reason`、`action`。

| action | 其他参数 |
|---|---|
| `move` | x、y |
| `click` | x、y，button=left/right（默认 left），clicks=1/2（默认 1） |
| `scroll` | x、y，delta=-600...600，正向上、负向下 |
| `type` | text，不超过 2000 UTF-16 单位；不含换行和控制字符 |
| `key` | key、modifiers |

键名：a-z、0-9、return、tab、space、backspace、escape、left、right、down、up。

修饰键：cmd、shift、alt、ctrl。例如 `key: "a", modifiers: ["cmd"]` 全选。

Unicode 输入通过 CGEvent，不改剪贴板；部分应用或安全输入框可能不接受，应截图确认。快捷键字符依照 macOS 常见美式物理键码，非美式布局需要谨慎验证。

每次动作都消费截图，失败或不确定也不能复用：必须重新 `mac_screen`。没有批量动作、任意 shell、拖拽或自动连续运行模式。

## 安全设计及边界

- 开关只能通过用户命令开启，模型工具不能自己启用。
- 每次操作单独确认；不能跳过或自动批准。
- 工具串行排队，防止两个并行动作争抢鼠标键盘。
- 确认后再次检查启用状态、取消信号、截图期限和版本。
- 原生层检查前台应用能否恢复、显示器是否仍一致及参数范围。
- 操作结束返回“事件已发送”，**不是“任务完成”**，模型必须再截图验证。
- `/mac-computer off` 拒绝后续动作并取消在途 helper。已经发送的输入无法撤回，取消可能留下部分输入，应检查屏幕。
- 只进行固定 CGEvent 操作，不把模型文本拼接进 shell。

这不是沙箱，也不能完全证明目标窗口未变化。截图后应用内部布局或内容可能变化，即使应用 PID 相同也可能点错。每步确认不能替代视觉判断：看不清时应停止，不盲点；不要在操作期间自行移动窗口或争抢鼠标。

删除、付款、发布、发送消息、生产配置、账号／安全／隐私等操作，Agent 必须明确说明实际影响并取得授权。工具提示有此要求，但 **代码不能自动理解某个按钮的业务含义**；用户要核对确认参数，不能把一般操作理由当作充分授权。

截图里的网页、文档、聊天文字属于不可信数据。模型不得照着其中“忽略用户要求”“上传密钥”等内容行动。浏览器任务仍优先用现有 `agent_browser`，本扩展不是绕过浏览器限制的后门。

屏幕图片和 OCR 会进入你配置的模型服务与 Pi 会话记录。这与本地 OCR 不联网是两回事。请先关闭密码管理器、私人聊天、密钥、付款信息等敏感窗口。临时原图及缩放图在工具结束后删除；进程强制崩溃可能遗留在系统临时目录，可检查 `pi-mac-screen-*`。扩展没有额外日志保存，但不能阻止 Pi 记录工具结果。

## 验证记录与限制

在 macOS 26.3、Apple Silicon、Pi 0.99.2 上：

- Swift 编译和 ad-hoc 签名通过。
- helper `status` 通过，返回主屏幕 1512 × 982 point。
- Pi `--no-extensions -e index.ts --offline --help` 加载通过。
- 离线测试通过：默认关闭、坐标限制、图片结果、拒绝不发送输入、截图单次消费、RPC 拒绝、确认期间关闭、新会话关闭。
- 离线测试使用 mock helper，不截屏，不控制真实鼠标或键盘。

**未实机验证：** 屏幕截图、Vision OCR、真实点击、中文输入、滚动及快捷键。目前缺少 macOS 权限；请按上面的无害 TextEdit 测试验收。权限通过不等于完整操作已经验证。

当前电脑运行离线测试：

```bash
JITI_PATH=/Users/harden/.pi/agent/install/releases/0.99.2/node_modules/jiti \
TYPEBOX_PATH=/Users/harden/.pi/agent/install/releases/0.99.2/node_modules/typebox/build/index.mjs \
node test.mjs
```

其他电脑将这两个环境变量指向当地 Pi 安装中的对应文件。运行扩展时无需设置它们。

## 卸载与更新

先 `/mac-computer off`。删除用户扩展目录中这一项，然后 `/reload` 或重启。

本机这一项是软链接，删除软链接不会删除当前目录源代码。迁移安装是一份独立副本，后续源码更新不会自动同步；审查后替换安装目录并在其中运行 `node build.mjs`。
