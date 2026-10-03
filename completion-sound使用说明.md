# Pi 完成提示音扩展：操作说明

## 功能

Pi 完成整次回答、不会再自动继续时，播放一次 macOS 系统 Glass 提示音。不会在每次工具调用后播放。

自动播放仅用于交互式终端（TUI），不用于 print、JSON 或 RPC 模式。当前实现仅支持 macOS。

## 文件与加载方式

源码位置：

```text
~/python/extend/completion-sound.ts
```

Pi 自动发现位置（指向源码的软链接）：

```text
~/.pi/agent/extensions/completion-sound.ts
  → ~/python/extend/completion-sound.ts
```

直接修改 `~/python/extend/completion-sound.ts` 即可，无需维护两份源码，也无需修改 Pi 的 settings.json。

## 启用

在当前 Pi 中输入：

```text
/reload
```

之后启动 Pi 会自动加载。扩展使用 TypeScript，由 Pi 加载，无需单独编译或安装依赖。

## 命令

以下命令在 Pi 输入框中执行，不是在系统 Shell 中执行。

| 命令 | 作用 |
| --- | --- |
| `/completion-sound` | 查看当前状态和用法 |
| `/completion-sound test` | 立即试听（即使自动提示音已关闭也能试听） |
| `/completion-sound off` | 关闭自动提示音 |
| `/completion-sound on` | 开启自动提示音 |

默认开启。开关保存在内存中，仅作用于当前扩展运行时；重启 Pi 或执行 `/reload` 后恢复默认开启，不会写入配置文件。

## 更换音效

在源码中找到：

```typescript
"/System/Library/Sounds/Glass.aiff"
```

换成其他音效路径，例如：

```typescript
"/System/Library/Sounds/Ping.aiff"
```

然后在 Pi 中执行 `/reload` 和 `/completion-sound test`。

在 macOS 终端列出系统音效：

```bash
ls /System/Library/Sounds
```

在终端直接试听：

```bash
/usr/bin/afplay /System/Library/Sounds/Glass.aiff
```

也可以使用自定义音频的绝对路径，格式需为 `afplay` 支持的格式。

## 重新安装软链接

当前已建立软链接。只有在迁移或重新安装时才需要执行下面的命令：

```bash
mkdir -p ~/.pi/agent/extensions
ln -s ~/python/extend/completion-sound.ts ~/.pi/agent/extensions/completion-sound.ts
```

如果提示目标已存在，先检查，不要直接覆盖其他文件：

```bash
ls -l ~/.pi/agent/extensions/completion-sound.ts
```

不要同时通过 settings.json 或其他扩展文件加载同一份代码，以免重复注册、重复响铃。

## 停用或卸载

临时关闭：在 Pi 中执行 `/completion-sound off`。

永久停止自动加载：确认下面的文件确实是软链接，再移除链接：

```bash
ls -l ~/.pi/agent/extensions/completion-sound.ts
unlink ~/.pi/agent/extensions/completion-sound.ts
```

随后在 Pi 中执行 `/reload`。此操作保留 `~/python/extend` 中的源码和文档。

## 故障排查

1. **命令不存在**：执行 `/reload`，检查 Pi 是否报告扩展加载错误，并检查软链接目标是否存在。
2. **没有声音**：执行 `/completion-sound test`，检查系统音量、静音状态和音频输出设备；再用终端直接运行 `afplay` 排查。
3. **自动播放关闭**：执行 `/completion-sound on`。
4. **脚本运行不响**：属于设计行为，只有 TUI 模式自动播放。
5. **系统不支持**：当前只支持 macOS；Linux/Windows 需要更换播放实现。
6. **播放失败**：扩展会显示警告。文件不存在、播放程序失败或超时都应检查。

实现说明见同目录的 `实现过程.md`。
