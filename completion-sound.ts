import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Play once after the entire response settles, not after individual tool calls.
export default function (pi: ExtensionAPI) {
  let enabled = true;

  async function play(ctx: ExtensionContext) {
    if (process.platform !== "darwin") {
      ctx.ui.notify("完成提示音目前仅支持 macOS。", "warning");
      return;
    }
    try {
      const result = await pi.exec("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"], {
        timeout: 5000,
      });
      if (result.code !== 0) {
        ctx.ui.notify(`提示音播放失败：${result.stderr || "请检查系统音频输出"}`, "warning");
      }
    } catch (error) {
      ctx.ui.notify(`提示音播放失败：${String(error)}`, "warning");
    }
  }

  pi.on("agent_settled", async (_event, ctx) => {
    // Don't make sounds for scripts, print mode, or remote RPC clients.
    if (enabled && ctx.mode === "tui") await play(ctx);
  });

  pi.registerCommand("completion-sound", {
    description: "完成提示音：on / off / test（开关仅作用于当前 Pi 进程）",
    handler: async (args, ctx) => {
      switch (args.trim()) {
        case "on":
          enabled = true;
          ctx.ui.notify("完成提示音已开启。", "info");
          break;
        case "off":
          enabled = false;
          ctx.ui.notify("完成提示音已关闭。", "info");
          break;
        case "test":
          await play(ctx);
          break;
        default:
          ctx.ui.notify(`完成提示音${enabled ? "已开启" : "已关闭"}。用法：/completion-sound on | off | test`, "info");
      }
    },
  });
}
