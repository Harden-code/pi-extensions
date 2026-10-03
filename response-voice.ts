import { spawn } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Local, offline speech. No API keys, files, or cloud speech service. */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n[\s\S]*?```/g, "（代码略。）")
    .replace(/~~~[^\n]*\n[\s\S]*?~~~/g, "（代码略。）")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "（链接略）")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function finalAssistantText(messages: readonly unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; stopReason?: string; content?: { type: string; text?: string }[] };
    if (msg?.role !== "assistant") continue;
    // Never speak partial, aborted, failed, or tool-calling assistant messages.
    if (msg.stopReason !== "stop" || !Array.isArray(msg.content)) return "";
    if (msg.content.some(block => block.type === "toolCall")) return "";
    return msg.content.filter(block => block.type === "text")
      .map(block => block.text ?? "").join("\n");
  }
  return "";
}

export function backend(platform: string): { command: string; args: string[] } {
  if (platform === "darwin") {
    return { command: "/usr/bin/say", args: ["-v", "Tingting", "-r", "180", "-f", "-"] };
  }
  if (platform === "win32") {
    // Script is constant; response content is stdin, never interpolated into executable code.
    const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet,
    [System.Speech.Synthesis.VoiceAge]::NotSet, 0,
    [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN'))
  $s.Speak([Console]::In.ReadToEnd())
} finally { $s.Dispose() }
`;
    return { command: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")] };
  }
  if (platform === "linux") return { command: "espeak-ng", args: ["-v", "cmn", "-s", "160", "--stdin"] };
  throw new Error(`不支持的平台：${platform}。支持 macOS、Windows、Linux。`);
}

export async function speakLocal(text: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const spec = backend(process.platform);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, { stdio: ["pipe", "ignore", "pipe"], shell: false, windowsHide: true });
    let errorText = "";
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      if (!killTimer) {
        killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
        killTimer.unref();
      }
    };
    const timeout = setTimeout(() => { timedOut = true; kill(); }, 10 * 60_000);
    timeout.unref();
    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener("abort", kill);
    };
    signal.addEventListener("abort", kill, { once: true });
    child.stderr.on("data", chunk => { errorText = (errorText + String(chunk)).slice(-1000); });
    child.stdin.on("error", () => { /* EPIPE is handled by child close/error. */ });
    child.once("error", error => { cleanup(); reject(new Error(`无法启动中文语音引擎：${error.message}`)); });
    child.once("close", code => {
      cleanup();
      if (signal.aborted) resolve();
      else if (timedOut) reject(new Error("播报超过 10 分钟，已停止。"));
      else if (code !== 0) reject(new Error(`语音引擎失败（${code}）：${errorText || "请检查中文声音与音频输出"}`));
      else resolve();
    });
    if (signal.aborted) kill();
    child.stdin.end(text, "utf8");
  });
}

type Speaker = (text: string, signal: AbortSignal) => Promise<void>;

// Optional dependency injection is for offline tests; Pi supplies only pi.
export default function responseVoice(pi: ExtensionAPI, speaker: Speaker = speakLocal) {
  let enabled = false; // Deliberately never persisted: each session/reload starts OFF.
  let candidate = "";
  let active: AbortController | undefined;
  let lastTask: Promise<void> = Promise.resolve();
  let generation = 0;

  function stop(ctx: ExtensionContext) {
    generation++;
    active?.abort();
    active = undefined;
    if (ctx.mode === "tui") ctx.ui.setStatus("response-voice", undefined);
  }

  function launch(text: string, ctx: ExtensionContext) {
    stop(ctx);
    const controller = new AbortController();
    active = controller;
    const current = generation;
    // Serialize replacement after old process actually exits; never overlap speech.
    lastTask = lastTask.catch(() => {}).then(async () => {
      if (controller.signal.aborted) return;
      ctx.ui.setStatus("response-voice", "中文播报中 · /response-voice stop 停止");
      try {
        await speaker(speechText(text), controller.signal);
      } catch {
        if (!controller.signal.aborted && current === generation) {
          // Do not echo stderr/response text: it may contain sensitive material.
          ctx.ui.notify("中文播报失败。请检查系统中文语音引擎；参见 response-voice使用说明.md。", "warning");
        }
      } finally {
        if (current === generation) {
          active = undefined;
          ctx.ui.setStatus("response-voice", undefined);
        }
      }
    });
  }

  pi.on("session_start", async (_event, ctx) => { stop(ctx); enabled = false; candidate = ""; });
  pi.on("session_tree", async (_event, ctx) => { stop(ctx); candidate = ""; });
  pi.on("before_agent_start", async (_event, ctx) => { stop(ctx); candidate = ""; });
  pi.on("agent_end", async (event) => { candidate = finalAssistantText(event.messages); });
  pi.on("agent_before_settle", async (event) => {
    if (event.outcome !== "completed") candidate = "";
  });
  pi.on("agent_settled", async (_event, ctx) => {
    const text = candidate;
    candidate = ""; // Consume once, even if disabled: never replay old responses on enable.
    if (enabled && ctx.mode === "tui" && speechText(text)) launch(text, ctx);
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    stop(ctx);
    enabled = false;
    candidate = "";
    await lastTask;
  });

  pi.registerCommand("response-voice", {
    description: "中文响应播报（默认关闭）：on / off / stop / test / status",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify("语音播报仅支持本机交互终端，不在 RPC、JSON、print 中播放。", "warning");
        return;
      }
      switch (args.trim().toLowerCase()) {
        case "on":
          enabled = true;
          ctx.ui.notify("中文响应播报已开启，从后续完成的回复开始播报。", "info");
          break;
        case "off":
          enabled = false; candidate = ""; stop(ctx);
          ctx.ui.notify("响应播报已关闭。", "info");
          break;
        case "stop":
          candidate = ""; stop(ctx);
          ctx.ui.notify("当前播报已停止，开关保持不变。", "info");
          break;
        case "test":
          // Explicit test does not turn automatic speech on.
          launch("你好，这是 Pi 的中文语音播报测试。响应播报默认关闭，需要手动开启。", ctx);
          break;
        case "":
        case "status":
          ctx.ui.notify(`响应播报：${enabled ? "开启" : "关闭"}；默认语言：中文。命令：/response-voice on | off | stop | test | status`, "info");
          break;
        default:
          ctx.ui.notify("用法：/response-voice on | off | stop | test | status", "warning");
      }
    },
  });
}
