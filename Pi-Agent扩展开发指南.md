# Pi Agent 扩展开发指南

> 面向希望给 Pi Coding Agent 添加工具、命令、事件处理和工作流的开发者。
>
> **版本基准：本机 `pi --version` 为 `0.99.2`。** 本文以该版本随安装提供的官方文档、扩展示例和 TypeScript 类型声明为依据。其他版本的包名、事件和接口可能不同，请优先核对安装版本。
>
> **本文只提供指南和示例，不会安装扩展、修改 Pi 配置或执行示例中的工具。** 当前目录已有的 `completion-sound.ts`、`README.md`、`实现过程.md` 保持不变。

## 目录

1. [扩展是什么，什么时候应该使用](#1-扩展是什么什么时候应该使用)
2. [运行模型与开发前准备](#2-运行模型与开发前准备)
3. [五分钟创建第一个扩展](#3-五分钟创建第一个扩展)
4. [扩展加载与目录组织](#4-扩展加载与目录组织)
5. [核心 API 与工具执行契约](#5-核心-api-与工具执行契约)
6. [完整实战：Git 状态查询扩展](#6-完整实战git-状态查询扩展)
7. [事件与生命周期](#7-事件与生命周期)
8. [命令、输入变换和消息注入](#8-命令输入变换和消息注入)
9. [状态持久化与会话分支](#9-状态持久化与会话分支)
10. [并发、取消和资源清理](#10-并发取消和资源清理)
11. [UI 与不同运行模式](#11-ui-与不同运行模式)
12. [工具权限与安全边界](#12-工具权限与安全边界)
13. [高级能力：工具曝光、MCP 和模型接入](#13-高级能力工具曝光mcp-和模型接入)
14. [调试与测试](#14-调试与测试)
15. [打包与分发](#15-打包与分发)
16. [结合当前目录的完成提示音扩展](#16-结合当前目录的完成提示音扩展)
17. [常见问题与上线检查清单](#17-常见问题与上线检查清单)
18. [官方参考与建议学习顺序](#18-官方参考与建议学习顺序)

---

## 1. 扩展是什么，什么时候应该使用

Pi 的 extension 是运行在 Pi 进程中的 TypeScript / JavaScript 模块。它通过注册 API，为 Pi 增加可执行行为。

典型用途：

- 给模型增加一个自定义工具，例如查询工单、读取内部知识库、运行项目检查。
- 给用户增加一个 `/` 命令，例如 `/git-status`、`/completion-sound`。
- 监听模型、工具、会话和输入事件。
- 在工具执行前拦截危险操作。
- 存储会话状态，恢复待办列表或工作流阶段。
- 添加状态栏、选择框、工具结果渲染或自定义终端组件。
- 注册 MCP 服务、自定义模型提供商或模型路由器。

### 1.1 不要把所有定制都做成 extension

| 需求 | 更适合的机制 | 原因 |
|---|---|---|
| 固定项目规范、编码约束 | `AGENTS.md` | 只是提供说明，不需要执行逻辑 |
| 复用一段提示词 | Prompt Template | Markdown 文件即可变成 `/` 命令 |
| 一套按需加载的任务指南，包含脚本和参考资料 | Skill | 模型先看到描述，需要时再读取正文 |
| 注册工具、事件、命令、状态和交互 | Extension | 需要程序化接入 Pi 运行时 |
| 接入已有的跨客户端工具服务 | MCP | 可复用标准协议服务 |
| 分发上述多种资源 | Pi Package | 包装和安装单位，不是另一种执行接口 |

**判断规则：只有当需求需要程序逻辑或运行时钩子时，才优先写扩展。**

### 1.2 Tool 与 Command 的区别

- `pi.registerTool()`：给模型调用，参数来自模型生成的工具调用。
- `pi.registerCommand()`：给用户调用，用户输入 `/命令 参数`。
- 注册命令时名称不带 `/`。
- 命令通常不需要模型参与；只有显式发送用户消息等行为，才会触发模型工作。
- 同一个业务模块可以同时提供工具和命令，二者共用业务函数。

例如：模型可以调用 `project_git_status`，用户也可以直接输入 `/git-status`。

## 2. 运行模型与开发前准备

### 2.1 扩展入口

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 在这里注册工具、命令和事件。
}
```

入口工厂接收 `ExtensionAPI`；事件、命令和工具执行时另外获得 `ctx` 上下文。

可以把两者理解为：

```text
pi：注册能力、控制当前扩展运行时、发消息、执行进程
ctx：本次回调对应的工作目录、会话、模式、UI 和取消信号
```

工厂也可以是 `async`。Pi 会等待它完成，适合启动前读取必要配置、注册 provider。

**不要在工厂中直接启动长期计时器、文件监听器、服务或子进程。** 有些命令只加载扩展，却不启动会话。长期资源应在 `session_start` 或实际使用它的命令／工具中创建。

### 2.2 TypeScript 不需要先编译

Pi 使用 `jiti` 加载本地 TypeScript 扩展，因此开发时可以直接加载 `.ts` 文件。

这不等于可以忽略类型检查：运行时加载只解决“如何执行 TypeScript”，并不替代 `tsc --noEmit` 和测试。

### 2.3 确认环境

```bash
pi --version
pi --help
node --version
npm --version
```

本文使用的当前包名：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
```

网上旧教程可能采用其他包作用域。不要把旧教程的 import 和当前版本代码混用。

### 2.4 本地类型检查环境

对长期维护的扩展，建议创建独立项目并安装开发依赖：

```bash
mkdir my-pi-extension
cd my-pi-extension
npm init -y
npm install -D typescript @types/node \
  @earendil-works/pi-coding-agent@0.99.2 \
  @earendil-works/pi-ai@0.99.2 typebox
```

这里宿主包用于本地开发和类型检查。**分发时不要把宿主包放到 `dependencies` 中，也不要打进 bundle。** 后文给出 `peerDependencies` 示例。

可使用以下 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "extensions/**/*.ts"]
}
```

如果希望使用 ESM，`package.json` 中设置 `"type": "module"`。

## 3. 五分钟创建第一个扩展

创建 `hello.ts`：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "显示问候语",
    handler: async (args, ctx) => {
      const name = args.trim() || "world";
      if (ctx.hasUI) {
        ctx.ui.notify(`Hello, ${name}!`, "info");
      }
    },
  });
}
```

运行：

```bash
pi --extension ./hello.ts
```

在 Pi 输入：

```text
/hello
/hello 张三
```

预期：终端通知显示问候语。

这个例子只演示交互通知；在没有 UI 的 print / JSON 模式中，不会提供可见的命令输出。需要自动化输出时，应优先实现返回 `content` 的工具，而不是依赖通知。

### 3.1 最小模型工具

创建 `greet.ts`：

```typescript
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "project_greet",
    label: "问候",
    description: "生成一段问候语。需要向某个具体姓名问好时使用。",
    parameters: Type.Object({
      name: Type.String({ minLength: 1, description: "要问候的人名" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `你好，${params.name}！` }],
        details: { greeted: params.name },
      };
    },
  });
}
```

启动后要求模型“请调用 project_greet 向张三问好”，检查是否出现工具调用和结果。

## 4. 扩展加载与目录组织

### 4.1 三种主要加载方式

| 范围 | 路径／命令 | 用途 |
|---|---|---|
| 当前启动 | `pi -e ./hello.ts` | 开发和临时试用 |
| 用户级 | `~/.pi/agent/extensions/hello.ts` | 多个项目共享 |
| 项目级 | `.pi/extensions/hello.ts` | 只在当前项目使用 |

`~/.pi/agent` 是默认 agent 目录，可以通过 `PI_CODING_AGENT_DIR` 改变。

项目资源受 project trust 控制：没有信任项目时，项目扩展不会正常自动加载。自动化模式无法显示内置项目确认框，应提前建立信任，或在审查代码后使用一次性的 `--approve`。

### 4.2 文件与目录入口

Pi 自动发现扩展目录中的直接 `.ts` / `.js` 文件，以及包含 `index.ts` / `index.js` 的子目录。

小扩展：

```text
.pi/extensions/
└── completion-sound.ts
```

多文件扩展：

```text
.pi/extensions/
└── project-tools/
    ├── index.ts
    ├── service.ts
    └── package.json
```

不要把辅助 `.ts` 文件随意放到自动发现目录的顶层，否则可能被当成独立扩展入口。

更适合开发和发布的组织：

```text
my-pi-extension/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   ├── git-service.ts
│   └── state.ts
└── test/
    └── git-service.test.ts
```

通过 `package.json` 的 `pi.extensions` 指向 `src/index.ts` 即可。

### 4.3 在 settings 中引用当前目录文件

如果想保留当前目录里的扩展文件，而不是复制文件，可以手动将以下项目合并到用户级 settings：

```json
{
  "extensions": [
    "/Users/harden/python/extend/completion-sound.ts"
  ]
}
```

注意：**合并，不要覆盖已有的 settings 内容。** 本文不执行此修改。

相对路径规则：

- CLI 的 `-e ./file.ts`：相对于启动时的工作目录。
- 用户 `settings.json` 中路径：相对于 agent 目录。
- 项目 `.pi/settings.json` 中路径：相对于 `.pi` 目录，不是项目根目录。
- package manifest 中路径：相对于包根目录。

例如从 `.pi/settings.json` 引用项目根目录的 `completion-sound.ts`，应使用 `../completion-sound.ts`。

### 4.4 隔离开发与热重载

```bash
# 关闭自动发现、配置及内置扩展，仅加载显式指定的文件。
pi --no-extensions --extension ./hello.ts
```

活动会话内修改扩展后输入：

```text
/reload
```

重载会替换扩展运行时，闭包变量通常会重新初始化；持久状态需要从会话或外部存储恢复。

如果命令调用 `await ctx.reload()`，调用后不要再使用旧运行时的状态和上下文。

## 5. 核心 API 与工具执行契约

### 5.1 常用 API 速查

| API | 作用 |
|---|---|
| `pi.on(event, handler)` | 注册事件；返回取消订阅函数 |
| `pi.registerTool(definition)` | 注册模型工具 |
| `pi.registerCommand(name, options)` | 注册用户命令 |
| `pi.registerShortcut(key, options)` | 注册键盘快捷键 |
| `pi.registerFlag(name, options)` | 注册布尔或字符串 CLI 参数 |
| `pi.getFlag(name)` | 读取已注册 CLI 参数 |
| `pi.exec(command, args, options)` | 执行外部进程 |
| `pi.sendUserMessage(content, options)` | 发送用户消息，触发 turn |
| `pi.sendMessage(message, options)` | 发送自定义消息 |
| `pi.appendEntry(customType, data)` | 持久化不进入模型上下文的自定义条目 |
| `pi.getActiveTools()` | 当前声明给模型的工具名称 |
| `pi.setActiveTools(names)` | 设置当前工具集 |
| `pi.getAllTools()` | 获取注册工具及其元数据 |
| `pi.registerMcpServer(name, config)` | 注册当前会话的 MCP 服务 |

### 5.2 工具定义中的关键字段

```typescript
pi.registerTool({
  name: "my_tool",              // 模型调用的名字
  label: "我的工具",            // UI 标题
  description: "能力与使用时机", // 模型选择工具的重要依据
  parameters: Type.Object({}),  // 输入 schema
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: "完成" }],
      details: undefined,
    };
  },
});
```

`execute` 的参数顺序是：

```text
toolCallId → params → signal → onUpdate → ctx
```

- `toolCallId`：本次工具调用 ID。
- `params`：通过输入 schema 校验的参数。
- `signal`：可能为 `undefined` 的取消信号。
- `onUpdate`：可选进度回调；它不是最终返回值。
- `ctx`：工具执行上下文，包含 `ctx.cwd`、会话信息及 `ctx.executeTool()`。

将定义存入独立变量时，可使用导出的 `defineTool()` 保持参数类型推导。

### 5.3 参数 schema 与业务校验

建议：

- 必填参数使用 `Type.String()` 等。
- 可选参数使用 `Type.Optional()`。
- schema 可表达的限制尽量写进 schema。
- 跨字段规则仍需要业务校验，例如 `action === "add"` 时必须存在 `text`。
- 路径、权限、大小和网络目标必须按实际操作再次检查。

跨 provider 的字符串枚举建议使用：

```typescript
import { StringEnum } from "@earendil-works/pi-ai";

const Params = Type.Object({
  action: StringEnum(["list", "add", "toggle"] as const),
});
```

官方示例明确提醒：不要依赖 `Type.Union([Type.Literal(...)])` 表达字符串枚举，否则可能产生 Google API 兼容问题。

### 5.4 `content`、`details` 与 `structuredContent`

| 字段 | 用途 |
|---|---|
| `content` | 模型可读的文本、图片等内容块 |
| `details` | UI 渲染、状态恢复等结构化辅助数据 |
| `structuredContent` | 声明 `outputSchema` 时提供的机器可读输出 |

最小结果也应包含 `details`；没有辅助数据就使用 `details: undefined`。

数据型工具建议同时声明 `outputSchema` 并返回匹配的 `structuredContent`。模型仍然看到 `content`，codemode 等程序调用方则得到结构化数据，而不是自己解析说明文本。

### 5.5 错误处理

推荐普通执行失败直接抛出异常：

```typescript
throw new Error("目标文件不存在");
```

Pi 会把工具执行失败反馈给模型。

下面这种写法**不等于真正标记了工具错误**：

```typescript
return {
  content: [{ type: "text", text: "Error: 操作失败" }],
  details: undefined,
};
```

需要保留结构化错误数据时，可返回 `isError: true`，并提供相应结果字段。

### 5.6 输出大小与 `terminate`

大量输出会挤占模型上下文，应当：

1. 限制读取或查询量。
2. 截断模型可见内容。
3. 明确标注截断，提供完整结果文件路径或分页方式。
4. 使用宿主导出的 `truncateHead()`、`truncateTail()` 等工具，避免自行实现字节边界截断。

`terminate: true` 不是“工具函数执行结束”的标记。它用于让 agent 跳过工具后的自动跟进，且需满足该批次完成工具的一致终止条件。普通工具无需使用它。

## 6. 完整实战：Git 状态查询扩展

这一示例同时提供：

- 模型工具 `project_git_status`。
- 用户命令 `/git-status`。
- 外部进程执行、超时、取消、返回码检查。
- 结构化输出。
- 输出上限。

创建 `git-status.ts`：

```typescript
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface GitStatusData {
  cwd: string;
  clean: boolean;
  output: string;
  truncated: boolean;
}

const OutputSchema = Type.Object({
  cwd: Type.String(),
  clean: Type.Boolean(),
  output: Type.String(),
  truncated: Type.Boolean(),
});

export default function (pi: ExtensionAPI) {
  async function getStatus(
    cwd: string,
    signal?: AbortSignal,
  ): Promise<GitStatusData> {
    if (signal?.aborted) throw new Error("Git 状态查询已取消");

    const result = await pi.exec(
      "git",
      ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
      { cwd, signal, timeout: 10_000 },
    );

    if (signal?.aborted) throw new Error("Git 状态查询已取消");
    if (result.killed) throw new Error("Git 状态查询超时或进程被终止");
    if (result.code !== 0) {
      throw new Error(
        `Git 状态查询失败：${result.stderr.trim() || `退出码 ${result.code}`}`,
      );
    }

    const raw = result.stdout.trimEnd();
    const lines = raw ? raw.split("\n") : [];
    const maxLines = 200;
    const maxChars = 12_000;
    const firstLines = lines.slice(0, maxLines).join("\n");
    const truncated = lines.length > maxLines || firstLines.length > maxChars;

    return {
      cwd,
      clean: raw.length === 0,
      output: firstLines.slice(0, maxChars),
      truncated,
    };
  }

  function format(data: GitStatusData): string {
    if (data.clean) return `工作目录：${data.cwd}\nGit 工作区干净。`;
    return [
      `工作目录：${data.cwd}`,
      "Git 状态（porcelain v1）：",
      data.output,
      data.truncated ? "[输出已截断；如需全部状态，请进一步查询。]" : "",
    ].filter(Boolean).join("\n");
  }

  pi.registerTool({
    name: "project_git_status",
    label: "Git 状态",
    description:
      "查询当前项目的 Git 工作区状态，不提交、不暂存、不删除文件。" +
      "需要了解哪些文件发生变化时使用。返回最多 200 行、12000 个 UTF-16 码元。",
    parameters: Type.Object({}),
    outputSchema: OutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async execute(_id, _params, signal, _onUpdate, ctx) {
      const data = await getStatus(ctx.cwd, signal);
      return {
        content: [{ type: "text", text: format(data) }],
        details: { cwd: data.cwd, clean: data.clean },
        structuredContent: data,
      };
    },
  });

  pi.registerCommand("git-status", {
    description: "直接显示当前项目 Git 状态",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      try {
        const data = await getStatus(ctx.cwd, ctx.signal);
        ctx.ui.notify(format(data), "info");
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });
}
```

启动：

```bash
pi --no-extensions -e ./git-status.ts
```

交互测试：

```text
/git-status

请使用 project_git_status 查询当前项目状态，不要执行其他命令。
```

这个例子有意限制在 `ctx.cwd`，不允许模型输入任意目录。实际 Git 仓库可能位于该目录的父目录，因此“使用 cwd”本身不构成文件系统隔离。

示例的字符串截断用于控制显示量，不是通用字节安全截断方案；生产环境建议使用宿主截断工具，并实现完整结果文件或分页。大量文件名也不应通过长通知展示，适合改成 widget 或专用结果组件。

**这份文档中的示例未在真实模型会话中执行；请按第 14 节进行类型检查和功能验收。**

## 7. 事件与生命周期

### 7.1 生命周期示意

```text
扩展工厂执行，完成注册
    ↓
session_start
    ↓
input / before_agent_start
    ↓
agent_start
    ↓
一个或多个 turn：
  turn_start
  模型消息和流事件
  tool_call → 工具执行 → tool_result
  turn_end
    ↓
agent_end
    ↓
可能还有自动重试、恢复、压缩、队列续跑
    ↓
agent_before_settle（最后可请求续跑的边界）
    ↓
agent_settled（最终通知边界）
    ↓
会话关闭、替换或重载时清理资源
```

这是理解用途的示意，不是每种异常、重试路径的严格逐事件序列。

### 7.2 常用事件

| 事件 | 适用场景 |
|---|---|
| `session_start` | 初始化会话资源、恢复状态 |
| `session_tree` | 切换树节点后重建分支状态 |
| `session_shutdown` | 释放监听器、定时器、连接 |
| `input` | 改写输入或直接处理输入 |
| `before_agent_start` | 调整本次模型运行的提示结构 |
| `agent_start` | 标记开始工作 |
| `tool_call` | 校验、修改工具输入、阻止执行 |
| `tool_result` | 改写或脱敏工具结果 |
| `turn_end` | 基于本轮结果追加条目或请求续跑 |
| `agent_end` | 观察 agent loop 结束，不代表彻底停止 |
| `agent_before_settle` | 最终可行动边界，追加条目或请求一次续跑 |
| `agent_settled` | 最终通知，不应再请求自动续跑 |

### 7.3 `agent_end` 不等于“完全完成”

如果要播放提示音、发桌面通知或告知外部系统“Pi 不会自动继续”，使用 `agent_settled` 比使用 `agent_end` 更合适。

`agent_settled` 本身没有成功／失败字段，因此它表示“停止自动活动”，不保证任务成功。若只对成功任务通知，应另外记录 outcome 等事件信息。

### 7.4 事件处理顺序与返回值

- 处理器按扩展加载和注册顺序执行。
- `pi.on()` 返回取消订阅函数。
- 有些事件只通知，有些允许变换，有些允许取消。
- 不能假设所有事件都接受 `{ block: true }` 或 `{ continue: true }`。
- 多个 `tool_result` 处理器组合执行，后面的处理器能看到前面的修改。
- 工具事件可能来自并行调用，不要依赖兄弟调用已经完成。

### 7.5 提示词变换

`before_agent_start` 提供 `event.prompt`、`event.systemPrompt` 和结构化的 `event.systemPromptOptions`。

新扩展优先调整提示词结构、工具选择或 guideline，让 Pi 记录增量。若返回 `systemPrompt`，则是本次运行的整体替换，必须意识到它与结构化 transcript 记录的关系。

避免在每次事件触发时无条件累加同一条规则，也不要为了增加一条说明就删除宿主原有工具与安全指引。

### 7.6 续跑必须有终止条件

`turn_end`、`agent_before_settle` 可以返回边界条目并设置 `continue: true` 请求下一次模型调用。

必须设置明确条件和最大次数，例如“缺少校验结果且本轮尚未要求校验”。无条件返回 `continue: true` 可能让 agent 不停运行。

`agent_settled` 是通知事件，不应用它来实现这种续跑逻辑。

## 8. 命令、输入变换和消息注入

### 8.1 CLI 参数

```typescript
pi.registerFlag("project-tools-debug", {
  description: "开启项目工具调试日志",
  type: "boolean",
  default: false,
});

pi.on("session_start", async (_event, ctx) => {
  const debug = pi.getFlag("project-tools-debug") === true;
  if (debug && ctx.hasUI) {
    ctx.ui.notify("项目工具调试模式已开启", "info");
  }
});
```

运行：

```bash
pi -e ./your-extension.ts --project-tools-debug
```

读取参数值应安排在参数解析完成后的生命周期／执行阶段，而不是假定工厂注册时最终 CLI 值已经确定。

### 8.2 输入变换

```typescript
pi.on("input", async (event) => {
  // 避免重复处理扩展自己注入的内容。
  if (event.source === "extension") return { action: "continue" };

  if (event.text.startsWith("?brief ")) {
    return {
      action: "transform",
      text: `请用简短中文回答：${event.text.slice(7)}`,
    };
  }

  return { action: "continue" };
});
```

常见结果：

- `continue`：继续原有输入流程。
- `transform`：替换输入文本。
- `handled`：扩展已经处理，不再交给模型。

如果输入可能带图片，变换时要核对当前类型中的图片字段，避免丢失附件。长时间输入预处理还应考虑流式 steering 行为，参考官方 `input-transform-streaming.ts`。

### 8.3 主动让模型执行任务

```typescript
pi.sendUserMessage("请运行当前项目的测试并报告失败项。", {
  deliverAs: "followUp",
});
```

- `steer`：作为 steering 消息进入正在运行的流程。
- `followUp`：排队，在当前工作之后处理。
- `sendUserMessage()` 会触发 turn。
- 需要扩展命令／模板展开时，核对并使用 `expandPromptTemplates`。

### 8.4 自定义消息

```typescript
pi.sendMessage(
  {
    customType: "project-tools-note",
    content: "项目配置发生变化，请在后续操作中使用新的配置。",
    display: true,
    details: { source: "config-change" },
  },
  { triggerTurn: false },
);
```

`display` 控制展示，不代表秘密数据不会进入模型上下文。纯状态数据优先使用 `appendEntry()`。

不要从 `agent_settled` 每次无条件注入下一条任务，这会将完成通知变成新的循环。

### 8.5 命令上下文的特殊能力

命令收到 `ExtensionCommandContext`，它在普通上下文基础上增加等待 idle、重载、树导航和会话替换能力。

这些能力是 command-only 的：在生命周期事件里强行调用类似操作可能死锁。

替换会话后，旧上下文失效。先保存普通数据，再在 `withSession` 提供的新上下文里进行会话相关工作。

## 9. 状态持久化与会话分支

### 9.1 选择正确存储位置

| 状态类型 | 建议存储 |
|---|---|
| 临时运行开关 | 工厂闭包变量 |
| 跟随会话分支的工具状态 | 工具结果 `details` |
| 不进入模型上下文的持久数据 | `pi.appendEntry()` |
| 需要进入模型上下文的自定义内容 | `pi.sendMessage()` |
| 多会话／跨进程共享配置 | 外部文件、数据库等 |

闭包变量重载或重启后会丢失。外部配置则不天然跟随会话分支，不能用它替代分支状态。

### 9.2 使用 custom entry 保存开关

以下片段应放在扩展工厂中：

```typescript
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// 放在工厂内：
let enabled = true;

function restore(ctx: ExtensionContext) {
  enabled = true;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "custom") continue;
    if (entry.customType !== "my-extension-setting") continue;

    const data = entry.data as { enabled?: unknown } | undefined;
    if (typeof data?.enabled === "boolean") enabled = data.enabled;
  }
}

pi.on("session_start", async (_event, ctx) => restore(ctx));
pi.on("session_tree", async (_event, ctx) => restore(ctx));

pi.registerCommand("my-toggle", {
  description: "切换功能并保存到当前会话分支",
  handler: async (_args, ctx) => {
    enabled = !enabled;
    pi.appendEntry("my-extension-setting", { enabled });
    if (ctx.hasUI) ctx.ui.notify(`功能${enabled ? "开启" : "关闭"}`, "info");
  },
});
```

`getBranch()` 返回当前分支路径。不要扫描整个会话文件的所有 entry 来恢复状态，否则会把被放弃分支的历史混进来。

### 9.3 工具状态通过 `details` 恢复

例如待办工具可以返回：

```typescript
return {
  content: [{ type: "text", text: "已添加待办事项" }],
  details: {
    version: 1,
    todos: todos.map((todo) => ({ ...todo })),
    nextId,
  },
};
```

恢复时依次读取当前分支上的相关 `toolResult`，以最新有效快照为准。

注意：

- 需要 JSON 可序列化的数据。
- 添加版本号，方便未来迁移。
- 做运行时类型校验，不要完全信任历史 entry 的 `as` 断言。
- 深层可变对象不要只浅拷贝数组，否则后续修改可能污染旧快照。
- 必须在会话启动及导航改变历史后恢复；新建、切换、fork 等路径也应逐一验证。

### 9.4 嵌套工具与状态

`ctx.executeTool()` 的嵌套调用不单独生成 transcript 工具结果条目。因此依赖“扫描嵌套工具结果恢复状态”的设计不可靠。

如果一个状态型工具也允许嵌套调用，需明确把状态通过父工具结果、custom entry 等方式持久化，并测试分支恢复。或者限制其曝光方式，避免不支持的调用路径。

## 10. 并发、取消和资源清理

### 10.1 并发不是边缘情况

同一条模型消息里的多个工具调用可能并行运行。

如果工具共享内存计数器、游戏状态、待办列表等可变状态，考虑：

```typescript
executionMode: "sequential"
```

这表示该工具不能与其他工具调用并发执行。不要依赖“测试时模型总是一次只调用一个工具”。

### 10.2 文件变更必须覆盖完整事务

文件变更工具应使用宿主的 `withFileMutationQueue()`，将**完整读取—修改—写入**放在同一个队列操作中。

不要只锁最后的写入：两个调用可能先读到同一旧值，然后互相覆盖。

具体函数签名请查本机导出类型。队列解决宿主内协调，不意味着多个 Pi 进程、数据库和外部服务自动具备事务性。

### 10.3 取消与超时

```typescript
const result = await pi.exec("your-command", ["arg"], {
  cwd: ctx.cwd,
  signal,
  timeout: 30_000,
});
```

- `pi.exec()` 的 `timeout` 单位是毫秒。
- `signal` 可能不存在。
- 检查 `result.code`、`result.killed` 和取消状态。
- 网络请求同样要传递取消信号和设置超时。
- 工具已造成副作用之后取消，不代表副作用会自动回滚。

使用 `command + args[]`，不要将模型参数拼接成 shell 命令。即便不经过 shell，也要防范参数注入，比如用户输入被目标程序解释成 `--危险选项`；必要时使用 `--` 和白名单。

### 10.4 进度反馈

```typescript
onUpdate?.({
  content: [{ type: "text", text: "正在处理第 2/5 个阶段……" }],
  details: { stage: 2, total: 5 },
});
```

进度回调不替代最终结果。控制频率，不要每个字节都刷新；渲染器需要兼容 partial result。

### 10.5 清理长期资源

以下片段放在工厂中：

```typescript
let timer: ReturnType<typeof setInterval> | undefined;

function cleanup() {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

pi.on("session_start", async () => {
  cleanup();
  timer = setInterval(() => {
    // 做轻量工作；避免未捕获的异步异常。
  }, 10_000);
});

pi.on("session_shutdown", async () => {
  cleanup();
});
```

清理要幂等：重复调用不能报错。文件 watcher、socket、订阅和子进程也要保存句柄并显式释放。

## 11. UI 与不同运行模式

### 11.1 先用内置 UI

```typescript
ctx.ui.notify("处理完成", "info");
const ok = await ctx.ui.confirm("确认操作", "是否继续？");
const choice = await ctx.ui.select("选择环境", ["dev", "staging"]);
const text = await ctx.ui.input("输入说明", "可选说明");
ctx.ui.setStatus("my-extension", "工作中");
ctx.ui.setWidget("my-extension", ["阶段：校验", "进度：2/5"]);
```

- `confirm` 取消时为 `false`。
- `select` / `input` 取消时可能为 `undefined`。
- status / widget 的 key 应带扩展前缀，避免覆盖别的扩展。
- 完成后用 `undefined` 清除对应 status / widget。

### 11.2 `ctx.hasUI` 不等于 TUI

| 模式 | UI 能力 |
|---|---|
| TUI | 完整终端 UI、自定义组件 |
| RPC | 支持的对话和通知通过 RPC 协议转发 |
| JSON | 无交互 UI，stdout 为 JSONL 事件 |
| print | 无交互 UI，输出最终结果 |

判断方式：

```typescript
if (ctx.hasUI) {
  // 可使用 TUI / RPC 支持的通知或对话。
}

if (ctx.mode === "tui") {
  // 可以使用 custom() 等真正依赖终端的功能。
}
```

RPC 模式下 `ctx.hasUI === true`，但 `ctx.ui.custom()` 不支持真正的自定义终端界面。

### 11.3 自定义工具渲染

工具定义可以提供 `renderCall()`、`renderResult()`，返回 TUI component，例如 `Text`。

```typescript
import { Text } from "@earendil-works/pi-tui";

// 添加到工具定义中：
renderCall(_args, theme) {
  return new Text(theme.fg("toolTitle", "查询项目状态"), 0, 0);
}
```

渲染和业务逻辑要分离。模型使用 `content`，并不会读取你渲染的漂亮界面。

自定义组件必须：

- 确保每行不超过终端宽度。
- 使用 `visibleWidth()`、`truncateToWidth()` 等处理中文、emoji 和 ANSI。
- 更新状态后使缓存失效，并请求 render。
- 响应主题变化，不能永久缓存旧主题 ANSI 字符串。
- 用注入的完成回调结束 `ctx.ui.custom()`，不要手动 hide 它创建的 overlay。
- 输入组件正确传播 focus，避免中文输入法候选框位置错误。

### 11.4 不要破坏 stdout 协议

JSON / RPC 模式的 stdout 是协议通道。不要随意 `console.log()` 输出调试文字。

调试日志可使用 stderr 或受控文件，但仍须脱敏。业务结果则应通过工具返回或相应消息 API 传递。

## 12. 工具权限与安全边界

### 12.1 一个演示性质的权限门

以下示例确认元数据提示可能有风险的工具。它不是完整沙箱：

```typescript
pi.on("tool_call", async (event, ctx) => {
  const hints = pi.getAllTools()
    .find((tool) => tool.name === event.toolName)?.annotations;

  const needsApproval =
    hints?.destructiveHint === true ||
    (!hints?.readOnlyHint &&
      ((hints?.destructiveHint ?? true) || (hints?.openWorldHint ?? true)));

  if (!needsApproval) return;

  if (!ctx.hasUI) {
    return { block: true, reason: "该工具需要人工确认，当前模式没有交互 UI。" };
  }

  const ok = await ctx.ui.confirm("允许工具调用？", event.toolName);
  if (!ok) return { block: true, reason: "用户拒绝执行。" };
});
```

生产实现还需要展示参数摘要、限制敏感内容、考虑并发确认和审计记录。

### 12.2 不要误把元数据当证明

`readOnlyHint`、`destructiveHint`、`idempotentHint`、`openWorldHint` 是声明性提示，Pi 不验证它们真实性。

工具被标注只读，不代表内部实现不会写文件。未知或不可信来源应采用保守策略。

### 12.3 拦截工具不等于拦截全部代码

`tool_call` 能拦截模型发出的工具调用，以及走工具管线的嵌套工具和 MCP 调用。

但扩展在命令／事件中直接使用 `pi.exec()` 或 Node 文件 API，并不会因为“注册了权限门”就自动变成受控工具调用。

因此：

- command 与 event 中的高风险动作也要显式确认和校验。
- 不要以为只拦截 `write` / `edit` 就保护了文件，`bash`、其他工具和扩展代码也能写。
- 检查 `rm -rf` 字符串只是演示，无法可靠识别 shell 的全部危险形式。

### 12.4 真正的安全边界

扩展与 Pi 同进程运行，拥有同一用户的操作系统权限。它可以读取文件、环境变量、会话甚至凭据。

Project trust 只控制项目资源是否加载，不限制加载后的工具访问范围。`ctx.cwd` 也不是沙箱。

对不可信任务或扩展，使用独立账户、容器、虚拟机或 OS 沙箱，并尽量减少暴露的文件、网络和凭据。

**不要在参数、details、日志、通知或 transcript 中写入 API key、token 和完整 Authorization header。**

## 13. 高级能力：工具曝光、MCP 和模型接入

### 13.1 工具 exposure

| exposure | 行为概述 |
|---|---|
| `direct` | 默认；激活时直接声明给模型，也可被嵌套调用 |
| `model-only` | 激活时只给模型直接调用，不允许嵌套调用 |
| `codemode` | 注册后可被脚本／其他工具调用，默认不直接声明给模型 |
| `deferred` | 可间接调用，但不会被 codemode 主动列出；可通过搜索发现 |
| `hidden` | 已注册但不可达 |

注意自定义工具与 MCP 服务在描述列表上的具体行为存在差别，应分别核对文档。

`direct` / `model-only` 默认注册即激活，也可用 `defaultActive: false` 保持初始不激活。其他 exposure 不会注册即激活。

`setActiveTools()` 应基于已注册工具名称操作，未知名称会被忽略。添加工具时保留原列表，避免意外禁用必要工具：

```typescript
const active = new Set(pi.getActiveTools());
active.add("project_git_status");
pi.setActiveTools([...active]);
```

### 13.2 嵌套调用已有工具

工具执行上下文中可以调用：

```typescript
const nested = await ctx.executeTool("read", { path: "README.md" }, {
  signal,
});
```

注意：

- 只对可调用工具有效，查询 `ctx.tools` 和 exposure。
- 使用当前版本 `AgentToolCallOutcome` 类型解包结果，不要假定直接返回一个字符串。
- 参数会校验，`tool_call` / `tool_result` 处理器会执行。
- 嵌套执行事件携带 `parentToolCallId`。
- 嵌套结果不自动独立写入 transcript，父工具负责汇总结果。
- 嵌套模型 usage 会自动计入调用工具，不要重复相加。

### 13.3 注册 MCP 服务

```typescript
pi.registerMcpServer("company_docs", {
  url: "https://mcp.example.com/mcp",
  headers: { Authorization: "Bearer ${COMPANY_DOCS_TOKEN}" },
  exposure: "codemode",
  description: "搜索和读取公司内部文档",
});
```

URL 是占位符，使用前必须替换成真实、受信任的服务。

- 工厂中注册的服务在 session 启动时连接；稍后注册则立即连接。
- 注册不写入配置，下次加载需要再次注册。
- 同名 `mcp.json` 配置优先于扩展注册。
- `pi.unregisterMcpServer(name)` 关闭连接并撤回可达性。
- MCP `timeout` 单位是秒，与 `pi.exec()` 的毫秒不同。
- 使用内置 `/mcp` 检查扩展注册的服务。
- shell 命令 `pi mcp list` 不加载扩展，因此看不到仅由扩展注册的服务。
- 内置 MCP 被其他扩展替换时，应核对相应注册是否能被接管。

### 13.4 Provider 与虚拟模型

优先选择最小实现：

| 需求 | 选择 |
|---|---|
| OpenAI / Anthropic 等兼容接口的自定义地址 | `models.json` |
| 自定义鉴权、模型发现、协议处理 | `pi.registerProvider()` |
| 每次请求选择物理模型 | `pi.registerVirtualModel()` |

Provider 不是普通工具，接入时还需正确实现流事件、工具调用、usage、取消、错误和跨 provider transcript 转换。

虚拟模型在 `/model` 可选，但 provider 最终只收到物理模型。续跑或重试尽量保持上次物理模型，避免频繁丢失 prompt cache；状态通过 router 的 `state` 跟随会话分支。

不要为了调用一个兼容 API 就复制整套流实现；优先复用宿主支持的 API。

## 14. 调试与测试

### 14.1 最小验证顺序

1. `pi --version` 确认目标版本。
2. `npx tsc --noEmit` 检查 TypeScript。
3. `pi --no-extensions -e ./extension.ts` 检查加载。
4. 手动运行 slash command。
5. 明确要求模型调用自定义工具。
6. 测试失败、取消、超时和重载。
7. 再测试项目自动加载与 package 安装。

不要一开始就装到用户全局目录，避免影响所有 Pi 会话。

### 14.2 print / JSON 测试

以下调用会使用已配置的模型和凭据，可能产生 token 费用：

```bash
pi --no-extensions -e ./git-status.ts \
  --tools project_git_status \
  --print "调用 project_git_status，简短说明 Git 状态。"

pi --no-extensions -e ./git-status.ts \
  --tools project_git_status \
  --mode json "调用 project_git_status。" > events.jsonl
```

`--tools` 替换整个工具选择，应写出需要的全部工具。`--no-tools` 则禁用所有工具，不适合检查工具调用。

明确指定工具和提示词能降低误调用，但模型不保证一定按要求调用。验收时必须检查真实工具事件，而不只是最终回答文字。

测试状态恢复时不要使用 `--no-session`，因为它不会保存会话。

### 14.3 推荐测试矩阵

| 场景 | 需要确认 |
|---|---|
| 正常输入 | 返回类型与文本正确 |
| 缺字段／非法字段 | schema 或业务校验拒绝 |
| 非 Git 目录等外部错误 | 真正生成工具错误，而非伪成功文本 |
| 外部命令不存在 | 有可理解的错误信息 |
| 超时／取消 | 子进程停止，无无限等待 |
| 并行工具调用 | 状态不竞争，文件不丢更新 |
| 多次 `/reload` | 无重复 listener、timer、socket |
| 恢复会话 | 状态正确重建 |
| 树导航与 fork | 只读取当前分支状态 |
| JSON / RPC | stdout 没有调试污染 |
| 无 UI 模式 | 不依赖确认框或 custom 组件 |
| 窄终端、中文、emoji | 不溢出，输入法位置正常 |
| 主题切换 | 不保留旧主题缓存 |
| 巨量输出 | 截断清楚，能进一步获取 |
| 敏感输入 | 日志和 transcript 不泄露秘密 |

### 14.4 单元测试与集成测试分层

业务模块不要强依赖 `ctx`：

```text
extension entry：注册 Pi API
service layer：参数校验、调用进程／服务、结构化结果
state layer：快照、恢复、版本迁移
render layer：格式化与 TUI
```

单元测试可向业务层注入假的执行器，覆盖返回码、stderr、空结果、超时。

集成测试再使用真实 Pi，验证事件顺序、命令、工具 schema、会话恢复和模式兼容。

只测纯业务逻辑不能证明扩展已经正确加载；只手动问一次模型也不能证明并发和错误路径正确。

## 15. 打包与分发

### 15.1 Pi package manifest

`package.json` 示例：

```json
{
  "name": "@your-scope/pi-project-tools",
  "version": "0.1.0",
  "type": "module",
  "description": "Project workflow tools for Pi",
  "keywords": ["pi-package"],
  "files": ["src", "README.md"],
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-ai": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "0.99.2",
    "@earendil-works/pi-ai": "0.99.2",
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0"
  }
}
```

这是 manifest 示例；实际开发应把用于检查的 `typebox` 等开发依赖补齐并锁定。

Pi 提供以下宿主包：

- `@earendil-works/pi-ai`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

实际导入哪些就声明哪些 peer dependency。普通第三方运行依赖放 `dependencies`。

宿主包使用 `peerDependencies: "*"` 是官方推荐的模块复用方式，并不代表你的代码兼容所有 Pi 版本。README 必须说明实际验证版本。

### 15.2 本地、npm 与 Git 安装

```bash
# 不写配置，临时加载本地包。
pi -e ./my-pi-extension

# 安装本地包到当前项目的 package 配置。
pi install ./my-pi-extension --local

# npm / Git 示例：替换为真实发布源。
pi install npm:@your-scope/pi-project-tools@0.1.0
pi install git:github.com/your-org/pi-project-tools@v0.1.0

pi list
pi remove npm:@your-scope/pi-project-tools
```

本地包从原路径加载，不复制；本地包依赖树需要作者自行安装。远程 npm / Git package 由 Pi 管理安装。

### 15.3 发布前核对包内容

```bash
npm pack --dry-run
```

检查：

- 入口和导入的辅助文件都在 tarball 中。
- 不包含 `.env`、token、会话文件和测试秘密。
- 不包含重复宿主运行时。
- README 说明安装、卸载、配置、权限、版本和平台限制。
- 使用固定版本或 Git tag，便于复现。

`pi update` 默认更新 Pi 本体；更新 package 使用 `pi update --extensions` 或指定 source，避免误解命令用途。

## 16. 结合当前目录的完成提示音扩展

当前目录已有：

```text
/Users/harden/python/extend/
├── completion-sound.ts
├── README.md
├── 实现过程.md
└── Pi-Agent扩展开发指南.md
```

`completion-sound.ts` 是一个适合作为起点的“小而完整”扩展，它已经实现：

1. 默认导出工厂，接收 `ExtensionAPI`。
2. 用 `enabled` 闭包变量保存当前开关。
3. 监听 `agent_settled`，而不是每次工具完成就播放声音。
4. 仅在 `ctx.mode === "tui"` 时自动播放，避免脚本和 RPC 客户端触发本机声音。
5. 检查 `process.platform === "darwin"`。
6. 调用 `/usr/bin/afplay` 播放系统 `Glass.aiff`。
7. 设置 5000 毫秒执行超时，并检查非零退出码。
8. 注册 `/completion-sound on | off | test`。

临时运行：

```bash
cd /Users/harden/python/extend
pi -e ./completion-sound.ts
```

在 Pi 中测试：

```text
/completion-sound test
/completion-sound off
/completion-sound on
```

### 16.1 这个例子说明的开发思路

```text
需求：整次响应停止后提示用户
    ↓
无需模型工具，只需要事件 + 用户命令
    ↓
选择 agent_settled 最终通知事件
    ↓
封装 play(ctx) 业务函数
    ↓
增加平台判断、模式判断、超时和错误处理
    ↓
通过命令手动测试，避免依赖模型任务完成来调试音频
```

### 16.2 可以进一步增强什么

| 增强 | 实现建议 |
|---|---|
| 重载后保持开关 | custom entry 恢复当前分支状态 |
| 全局默认设置 | 独立配置文件，明确与会话开关优先级 |
| 只在成功后播放 | 另外记录运行 outcome，不能只看 `agent_settled` |
| 配置不同声音 | 白名单参数，不允许任意 shell 命令 |
| 避免连续触发 | 去抖／节流，记录最近播放时间 |
| 支持 Linux / Windows | 平台适配器，检查程序是否存在 |
| 更强失败诊断 | 同时检查 `result.killed`，区分超时与程序错误 |

现有开关只作用于扩展运行时；重载或重启会回到默认 `true`。现有自动通知表示“完全 settle”，并不区分完成、失败或取消。

## 17. 常见问题与上线检查清单

### 17.1 常见问题

**Q：文件放在当前目录，为什么 Pi 没有加载？**

当前目录的任意 `.ts` 文件不会自动成为扩展。使用 `-e`，放到 `.pi/extensions/`，或者配置 `extensions` 路径。

**Q：项目扩展在 print 模式中没有生效？**

先检查项目 trust。无交互模式不能显示内置确认框；只有已信任、显式 approve 或相应可信策略才会加载受保护项目资源。

**Q：重载之后设置消失？**

闭包重新初始化。用会话 entry 或外部配置持久化，并恢复状态。

**Q：工具返回了 Error 文本，但 Pi 认为成功？**

普通返回对象不自动标记失败。抛出异常，或使用契约支持的 `isError: true`。

**Q：`ctx.hasUI` 为 true，但 `custom()` 不工作？**

可能是 RPC 模式。自定义终端组件需要 `ctx.mode === "tui"`。

**Q：工具没有被模型调用？**

依次检查加载错误、名称冲突、exposure、active tools、CLI `--tools` / `--no-tools`、模型可见描述。最后核对模型是否实际上选择了它。

**Q：注册了 MCP，但 `pi mcp list` 看不到？**

shell MCP 命令不加载扩展。扩展注册仅对会话生效，使用会话内 `/mcp`。

**Q：明明只改一个状态，为什么会丢更新？**

检查并行调用。共享状态工具使用 sequential，文件 read-modify-write 用完整 mutation queue，跨进程还需额外协调。

**Q：能否用正则拦截危险 bash 作为全部安全措施？**

不能。正则容易漏掉等价 shell 语法和其他执行路径，真正边界需要 OS 隔离和最小权限。

### 17.2 上线检查清单

- [ ] 有 default factory，import 与宿主版本匹配。
- [ ] 工具名、命令名、status key 不与其他扩展冲突。
- [ ] 描述写明功能、适用时机与边界。
- [ ] schema 和业务校验覆盖不合法输入。
- [ ] 结果包含 `content` 和 `details`。
- [ ] 数据型输出的 schema 与 structuredContent 一致。
- [ ] 错误是真实工具错误，不是伪成功字符串。
- [ ] 使用 timeout、取消信号和返回码检查。
- [ ] 大输出有截断、分页或完整文件定位。
- [ ] 并发和可变状态策略明确。
- [ ] 持久状态跟随当前分支，带版本和校验。
- [ ] TUI／RPC／JSON／print 模式行为明确。
- [ ] 长期资源只在正确生命周期启动，幂等清理。
- [ ] 日志、details、通知和包文件不泄露凭据。
- [ ] 高风险动作不依赖工具注释或简单正则作为唯一保护。
- [ ] 本地类型检查、单元测试和真实 Pi 验收通过。
- [ ] package 不重复打包宿主模块。
- [ ] README 明确权限、平台限制和已验证版本。

## 18. 官方参考与建议学习顺序

### 18.1 本机文档

本机安装根目录：

```text
/Users/harden/.pi/agent/install/releases/0.99.2/node_modules/@earendil-works/pi-coding-agent/
```

该路径随着 Pi 升级可能变化。

| 相对路径 | 内容 |
|---|---|
| `docs/extensions.md` | 扩展核心契约与生命周期 |
| `docs/configuration.md` | 用户、项目配置和目录 |
| `docs/settings.md` | 资源路径及工具选择 |
| `docs/cli.md` | CLI 加载、模式、package 命令 |
| `docs/packages.md` | 打包、依赖、分发 |
| `docs/tui.md` | 终端组件、focus、overlay |
| `docs/rpc-extension-ui.md` | RPC 对话与 UI 限制 |
| `docs/security.md` | project trust 与安全边界 |
| `docs/mcp.md` | MCP 配置、exposure 和扩展注册 |
| `docs/custom-provider.md` | provider 接入与流协议 |
| `docs/virtual-models.md` | 每次请求的模型路由 |
| `examples/extensions/` | 官方扩展示例 |
| `dist/core/extensions/types.d.ts` | 当前版本精确 API 类型 |
| `dist/index.d.ts` | 宿主公开导出 |

### 18.2 优先阅读的官方示例

| 示例 | 学习目标 |
|---|---|
| `hello.ts` | 最小工具、`defineTool()` |
| `todo.ts` | details 持久化、分支恢复、自定义 UI |
| `permission-gate.ts` | 工具调用前确认 |
| `protected-paths.ts` | 路径保护的演示 |
| `dynamic-tools.ts` | 运行时工具与提示说明 |
| `truncated-tool.ts` | 长输出截断 |
| `input-transform.ts` | 输入改写与直接处理 |
| `input-transform-streaming.ts` | steering 时避免昂贵预处理 |
| `reload-runtime.ts` | 安全重载 |
| `event-bus.ts` | 扩展间通信 |
| `rpc-demo.ts` | RPC 支持的 UI |
| `overlay-qa-tests.ts` | overlay、focus、主题与布局验收 |

官方示例是学习参考，不是所有生产要求的完整模板。复制时仍需按当前核心文档补充取消、并发、清理、安全和兼容性处理。

### 18.3 在线参考

- 仓库：<https://github.com/earendil-works/pi>
- 扩展文档：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>
- 类型定义：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts>
- 扩展示例：<https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions>
- Pi package gallery：<https://pi.dev/packages>

在线 `main` 可能比本机更新；本文实际依据本机 `0.99.2` 文档，不声称在线内容已逐一验证。

### 18.4 建议学习路线

```text
第 1 步：一个 /hello 命令
第 2 步：一个返回 content / details 的只读工具
第 3 步：增加取消、超时、错误与结构化输出
第 4 步：监听 session_start / agent_settled
第 5 步：实现状态恢复与分支测试
第 6 步：补齐非交互模式与并发测试
第 7 步：最后再做自定义 UI、MCP、provider 和 package 分发
```

**总结：一个可靠的 Pi 扩展不仅是 `registerTool()`。完整实现还包括加载方式、输入与输出契约、事件生命周期、并发与取消、分支状态、模式兼容、安全边界和发布验证。先从当前目录的完成提示音扩展理解“小需求如何选择正确钩子”，再逐步增加模型工具，是最稳妥的入门方式。**
