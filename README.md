# Pi Extensions

面向 [Pi Coding Agent](https://github.com/earendil-works/pi) 的个人扩展集合，包含完成提示音、中文响应播报、macOS 电脑控制及浏览器扩展迁移包。

主要以 Pi **0.99.2** 的本机文档与 API 为依据。不同 Pi 版本请先检查兼容性。

## 扩展与文档

| 项目 | 功能 | 入口／说明 |
|---|---|---|
| 完成提示音 | 整次回答结束后播放 macOS 提示音，默认开启 | [源码](completion-sound.ts) · [说明](completion-sound使用说明.md) |
| 响应语音播报 | 使用本机中文语音朗读最终回复，默认关闭 | [源码](response-voice.ts) · [说明](response-voice使用说明.md) |
| macOS 电脑控制 | 截屏、中文/英文 OCR、鼠标点击、滚动、键盘输入；默认关闭，每步确认 | [源码目录与说明](mac-computer-control/) |
| 浏览器迁移包 | 保存已安装浏览器扩展实现，提供安装与配置脚本 | [迁移包与说明](pi-browser-portable/) |
| 扩展开发指南 | 中文开发指南、事件、工具、命令、安全及发布 | [开发指南](Pi-Agent扩展开发指南.md) |

## 获取项目

```bash
git clone https://github.com/Harden-code/pi-extensions.git
cd pi-extensions
```

这些扩展可以分别安装，不必一次加载全部。

### 完成提示音（macOS）

```bash
pi --no-extensions -e ./completion-sound.ts
```

在 Pi 输入 `/completion-sound off` 关闭提示音。长期安装见专门说明。

### 中文语音播报

```bash
node install-response-voice.mjs --apply
```

重载或重启 Pi 后：

```text
/response-voice test
/response-voice on
/response-voice off
```

macOS 中文语音合成已验证；Windows、Linux 适配尚未实机验证。

### macOS 电脑控制

```bash
cd mac-computer-control
node install.mjs --apply
```

需要 Xcode Command Line Tools。在 macOS 系统设置中手动授权“屏幕录制”和“辅助功能”，重启宿主终端及 Pi 后：

```text
/mac-computer status
/mac-computer on
/mac-computer off
```

Agent 使用 `mac_screen` 看图与 OCR，再使用 `mac_input` 执行单步输入。每个动作需要确认，之后必须重新截图验证。

**当前已通过编译、加载和离线测试，实际桌面输入尚未验收。** 请先用空白 TextEdit 文档进行无害测试。

### 浏览器迁移包

```bash
cd pi-browser-portable
node install.mjs --apply --install-agent-browser --download-browser
```

不是完全离线安装包，具体依赖和验证限制见目录内 README。vendor 是 `pi-agent-browser-native 0.7.1` 的 npm 发布版 JavaScript 实现，不是完整上游 TypeScript 开发仓库，保留上游 MIT 许可证与校验清单。

## 安全与隐私

- 扩展与 Pi 宿主拥有同等系统权限，请审查源码后加载。
- 电脑控制默认关闭，每步确认不是绝对安全保证；确认前核实目标与影响。
- 屏幕截图、OCR 和工具结果可能进入模型服务及会话记录，先关闭敏感窗口。
- 不用电脑控制工具绕过浏览器授权或安全限制；网页操作优先使用浏览器工具。
- 对删除、付款、发送消息、发布、账号或生产配置等操作必须取得明确授权。
- 不包含个人浏览器资料、登录凭据、截图证据、本机缓存或编译二进制。

## 迁移与开发

各子项目 README 提供安装、权限、测试、卸载及平台限制。部分文档保留最初开发电脑的示例路径，它们不是安装前提，请在目标电脑替换成本地路径。

语音开关、电脑控制开关都不持久化，重载或新会话后恢复关闭。不要同时通过用户扩展目录、settings 和 `-e` 重复加载同一个扩展。

原始提示音实现记录：[实现过程.md](实现过程.md)。

## 许可证

本仓库暂未为原创代码选定开源许可证。公开可查看不等于授予无限制复用许可。第三方 vendor 内容以其目录中的 [MIT LICENSE](pi-browser-portable/vendor/pi-agent-browser-native/LICENSE) 为准。
