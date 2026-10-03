# Pi 响应中文语音播报扩展

## 功能

- **默认关闭**，必须通过 `/response-voice on` 手动开启。
- 默认使用系统中文语音，在本机交互终端（TUI）播放。
- 等整次响应 `agent_settled` 后，播报最后一条正常完成的 assistant 文本。
- 不播报 thinking、工具调用、工具结果、错误或取消的部分回复。
- 去掉常见 Markdown 标记、长 URL；围栏代码用“代码略”代替。
- 新任务开始会停止旧播报；不会叠加多个声音。
- 播报异步执行，不等待读完才能继续输入。
- 开关不持久化；重新加载扩展、启动或替换会话后恢复关闭。
- 不调用云端 TTS，不需要 API key，不把回复写入临时文件。

“默认中文”指中文语音引擎，不是自动翻译：英文回复仍按原文交给中文引擎。若希望回复也使用中文，请在对话中要求 Pi 用中文回答。

## 文件

```text
response-voice.ts                # 自包含 TypeScript 扩展
response-voice.test.mjs          # 离线事件／文本清洗／取消测试
install-response-voice.mjs       # 跨电脑复制安装脚本
response-voice使用说明.md        # 本文
```

运行扩展不需要额外 npm 依赖，Pi 直接加载 TypeScript。

## 当前电脑

已配置用户扩展软链接：

```text
~/.pi/agent/extensions/response-voice.ts
→ /Users/harden/python/extend/response-voice.ts
```

**在 Pi 中运行 `/reload` 或完全退出重启后生效。** 本次没有自动开启播报。

命令：

| 命令 | 行为 |
|---|---|
| `/response-voice` | 查看状态和用法 |
| `/response-voice status` | 查看状态 |
| `/response-voice on` | 手动开启，播报后续完成的回复 |
| `/response-voice off` | 关闭并停止正在进行的播报 |
| `/response-voice stop` | 停止当前播报，开关保持不变 |
| `/response-voice test` | 播放一段中文测试语音，不改变开关 |

建议首次使用：

```text
/reload
/response-voice status
/response-voice test
/response-voice on
```

然后要求 Pi：“请用中文简短介绍你能做什么。”

不需要播报时输入 `/response-voice off`。

你已有的 completion-sound 扩展独立运行，可能会先响完成提示音再读回复。如不想要提示音，可以单独 `/completion-sound off`，本扩展不会修改它。

## 在其他电脑安装

复制 `response-voice.ts`、`install-response-voice.mjs` 到同一个固定目录：

```bash
# 预览，无写入。
node install-response-voice.mjs

# 安装到当前用户的 ~/.pi/agent/extensions/。
node install-response-voice.mjs --apply
```

支持通过 `PI_CODING_AGENT_DIR` 选择不同 agent 目录。脚本遇到同名但内容不同的扩展会停止，不自动覆盖。

安装脚本复制文件，因此源文件移动不影响安装；后续更新需审查并替换安装目录中的旧版本。不要同时通过 settings 或 `-e` 再加载一份相同扩展，以免重复命令／播报。

临时试用（不安装）：

```bash
pi --no-extensions -e ./response-voice.ts
```

项目级使用也可放到 `.pi/extensions/response-voice.ts`，但需要项目 trust。建议对个人语音偏好使用用户级配置。

## 平台适配

### macOS（本机已验证）

使用系统 `/usr/bin/say`，默认声音 `Tingting`（普通话），语速 180。

本机已检查该声音可用，并成功合成中文音频文件（未自动播放）。

若目标电脑没有此声音，到系统辅助功能／朗读内容的声音设置中下载中文声音，或修改 `backend()` 中的声音名称。

### Windows（实现了适配，但未实机验证）

使用 Windows PowerShell 的 `System.Speech.Synthesis.SpeechSynthesizer`，按 `zh-CN` 选择语音。

要求 Windows PowerShell 和可用于 System.Speech 的中文语音。Windows 设置中下载的所有现代语音不一定都暴露给旧 SAPI/System.Speech，目标电脑需要通过 `/response-voice test` 验证。

脚本固定，回复通过 stdin 传入，不拼接到 PowerShell 代码中。无需更改 ExecutionPolicy。

### Linux（实现了适配，但未实机验证）

使用 `espeak-ng -v cmn --stdin`。

Ubuntu / Debian 可以手动安装：

```bash
sudo apt-get install espeak-ng
```

其他发行版使用对应包管理器。此命令会修改系统软件包，扩展不自动安装或提权。还需要目标桌面的音频输出环境。eSpeak 普通话较机械，不是云端高保真语音。

### 非交互模式

RPC、JSON、print 模式不会在 Pi 所在主机自动播放声音，即使某些模式有 `ctx.hasUI`。SSH 下的 TUI 播放的是远端主机声音，不会自动传回本地电脑。

## 实现要点

1. 工厂中 `enabled = false`。
2. `agent_end` 提取最后的正常 assistant 回复，仅接受 `stopReason === "stop"`。
3. `agent_before_settle` 根据 outcome 排除失败或取消。
4. `agent_settled` 消费候选回复一次，并且只在开启且 TUI 时启动播报。
5. 使用 stdin 输送文本，`spawn(..., shell: false)`，防止回复内容变成 shell 命令。
6. AbortController 停止当前子进程；旧进程退出后才播放新内容。
7. `session_shutdown` 等待播报子进程清理，`session_start` 重置为关闭。
8. 10 分钟硬超时，避免异常语音进程长期停留。

正常回复正文会完整送给语音引擎（除清洗规则），超长回复最多播报 10 分钟。可以手动 stop。不朗读围栏代码，但不是完整 Markdown AST 解析器，对特殊链接、表格和公式的清洗属于尽力处理。

## 验证记录

已通过：

- Pi 0.99.2 使用 `--no-extensions -e response-voice.ts --offline --help` 加载。
- 用 Pi 安装中的 jiti 加载扩展，测试默认关闭、手动开启关闭、取消、最终文本过滤、Markdown 清洗、测试不打开自动播报、RPC 不播放、失败不播放、新会话关闭等。
- macOS 中文声音 Tingting 存在。
- 中文文本通过 stdin 成功合成为 `/tmp/pi-response-voice-check.aiff`（135960 字节），**没有自动播放该文件**。
- 安装脚本语法检查及本机幂等安装检查通过。

未验证：Windows/Linux 实机音频输出；真实模型完整响应后的可听播报。请用 `/response-voice test` 及一个简短中文对话完成验收。

离线测试（开发用途，运行扩展本身不需要 jiti 额外依赖）：

```bash
# 当前电脑
JITI_PATH=/Users/harden/.pi/agent/install/releases/0.99.2/node_modules/jiti \
  node response-voice.test.mjs
```

其他电脑可将 `JITI_PATH` 指向 Pi 安装中的 jiti，或在独立测试目录安装 jiti。

## 安全与隐私

响应可能包含敏感信息，开启后旁人可能听见。不要在共享环境无意识开启。

只播报选定的最终正文，不代表正文已经自动脱敏。不会朗读思考过程或工具输出，但最终回复如果引用了秘密，仍然可能被读出。

使用本机系统语音，不上传文本到第三方 TTS。系统可能需要单独联网下载声音，但扩展本身没有网络请求。不要将其理解为操作系统的全面隐私保证。

关闭／停止只终止本扩展启动的语音进程，不执行 `killall say`，不会结束其他应用的语音。

卸载时删除 `~/.pi/agent/extensions/response-voice.ts` 这一项并重载 Pi。当前电脑删除的是软链接，不会删除本目录源码。
