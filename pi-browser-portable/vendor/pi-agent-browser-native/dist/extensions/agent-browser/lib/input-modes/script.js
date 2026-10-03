import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "../parsing.js";
import { extractExplicitNamespace, extractExplicitSessionName, scanUpstreamGlobalFlagOccurrences } from "../argv-grammar.js";
import { getUpstreamEffectiveBatchSteps } from "../orchestration/batch-stdin.js";
import { extractUpstreamCommandTokens } from "../argv-descriptor.js";
import { isCloseAllCommand } from "../command-taxonomy.js";
import { redactSensitiveText, validateToolArgs } from "../runtime.js";
export const AGENT_BROWSER_SCRIPT_CODE_MAX_BYTES = 64 * 1_024;
export const AGENT_BROWSER_SCRIPT_DEFAULT_TIMEOUT_MS = 120_000;
export const AGENT_BROWSER_SCRIPT_NAMESPACE = "";
export const AGENT_BROWSER_SCRIPT_MAX_TIMEOUT_MS = 300_000;
export const AGENT_BROWSER_SCRIPT_MAX_CALLS = 25;
export const AGENT_BROWSER_SCRIPT_FINAL_OUTPUT_MAX_BYTES = 64 * 1_024;
export const AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES = 1 * 1_024 * 1_024;
export const AGENT_BROWSER_SCRIPT_IPC_CUMULATIVE_MAX_BYTES = 8 * 1_024 * 1_024;
function findPackageRoot(startDir) {
    let currentDir = startDir;
    for (;;) {
        if (existsSync(join(currentDir, "package.json")))
            return currentDir;
        const parentDir = dirname(currentDir);
        if (parentDir === currentDir)
            throw new Error("Unable to resolve the pi-agent-browser-native package root.");
        currentDir = parentDir;
    }
}
function resolveScriptWorkerPath() {
    const workerPath = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), "dist", "extensions", "agent-browser", "script-worker.js");
    if (!existsSync(workerPath))
        throw new Error("Compiled script worker is missing; run npm run build or reinstall pi-agent-browser-native.");
    return workerPath;
}
const SCRIPT_SESSION_NAME_PATTERN = /^piab-script-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateAgentBrowserScriptSource(input) {
    if (typeof input !== "string")
        return { error: "script must be a string." };
    const bytes = Buffer.byteLength(input, "utf8");
    return bytes > AGENT_BROWSER_SCRIPT_CODE_MAX_BYTES
        ? { error: `script must be ${AGENT_BROWSER_SCRIPT_CODE_MAX_BYTES} bytes or less.` }
        : {};
}
export function createAgentBrowserScriptCloseArgs(sessionName) {
    return ["--namespace", AGENT_BROWSER_SCRIPT_NAMESPACE, "--session", sessionName, "close"];
}
export function isAgentBrowserScriptSessionName(value) {
    return typeof value === "string" && SCRIPT_SESSION_NAME_PATTERN.test(value);
}
export function validateAgentBrowserScriptBrowserParams(input) {
    if (!isRecord(input))
        return { error: "script browser(params) requires an object." };
    const unsupportedField = Object.keys(input).find((field) => !["args", "stdin", "timeoutMs"].includes(field));
    if (unsupportedField)
        return { error: `script browser(params) does not support ${unsupportedField}; use only args, stdin, and timeoutMs.` };
    if (!Array.isArray(input.args) || input.args.length === 0 || input.args.some((arg) => typeof arg !== "string")) {
        return { error: "script browser(params).args must be a non-empty string array." };
    }
    if (input.stdin !== undefined && typeof input.stdin !== "string") {
        return { error: "script browser(params).stdin must be a string when provided." };
    }
    if (input.timeoutMs !== undefined && (typeof input.timeoutMs !== "number" || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0)) {
        return { error: "script browser(params).timeoutMs must be a positive integer when provided." };
    }
    const params = {
        args: input.args,
        stdin: input.stdin,
        timeoutMs: input.timeoutMs,
    };
    const validationError = validateToolArgs(params.args);
    return validationError ? { error: validationError } : { params };
}
export function bindBrowserCodeCall(params, identity) {
    const explicitSession = extractExplicitSessionName(params.args);
    const namespaceFlags = scanUpstreamGlobalFlagOccurrences(params.args, "--namespace");
    const explicitNamespace = extractExplicitNamespace(params.args);
    if ((explicitSession !== undefined && explicitSession !== identity.sessionName)
        || (namespaceFlags.length > 0 && (explicitNamespace || undefined) !== (identity.namespace || undefined))) {
        throw new Error("A code call uses one browser identity. Set session/namespace on agent_browser_code to choose another browser.");
    }
    const tokens = extractUpstreamCommandTokens(params.args);
    if (isCloseAllCommand(tokens) || getUpstreamEffectiveBatchSteps(tokens, params.stdin).some(isCloseAllCommand)) {
        throw new Error("Run namespace-wide close --all directly with agent_browser, outside a session-scoped code call.");
    }
    return { ...params, args: [
            ...(namespaceFlags.length === 0 ? ["--namespace", identity.namespace ?? ""] : []),
            ...(explicitSession === undefined ? ["--session", identity.sessionName] : []),
            ...params.args,
        ] };
}
function buildRejectedCallEnvelope(error) {
    return {
        data: null,
        error,
        failureCategory: "validation-error",
        success: false,
        resultCategory: "failure",
        summary: error,
    };
}
function normalizeBrowserEnvelope(value) {
    if (!isRecord(value) || typeof value.success !== "boolean" || (value.resultCategory !== "success" && value.resultCategory !== "failure")) {
        return buildRejectedCallEnvelope("The browser executor returned an invalid code observation.");
    }
    return value;
}
function buildStepSummary(index, envelope) {
    return {
        failureCategory: envelope.failureCategory,
        index,
        ok: envelope.success,
        resultCategory: envelope.resultCategory,
        successCategory: envelope.successCategory,
        summary: envelope.summary ?? (typeof envelope.error === "string" ? envelope.error : "Browser call completed."),
    };
}
function buildFailedRun(options) {
    return { ...options, ok: false };
}
function describeScriptError(error) {
    const name = typeof error?.name === "string" && error.name.length > 0 ? error.name.slice(0, 80) : "Error";
    const message = typeof error?.message === "string" && error.message.length > 0
        ? error.message.replace(/[\r\n]+/g, " ").slice(0, 400)
        : "Script execution failed.";
    return `${name}: ${message}`;
}
function isScriptChildMessage(value) {
    if (!isRecord(value) || typeof value.type !== "string")
        return false;
    if (value.type === "ready")
        return true;
    if (value.type === "call")
        return typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0;
    if (value.type === "emit" || value.type === "image")
        return true;
    return value.type === "complete";
}
function waitForChildExit(child) {
    if (child.exitCode !== null || child.signalCode !== null)
        return Promise.resolve();
    return new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.once("error", () => resolve());
    });
}
function terminateChild(child) {
    child.stdin.destroy();
    if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    return setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
    }, 250);
}
async function settleWithin(promise, timeoutMs) {
    let timer;
    await Promise.race([
        promise.catch(() => undefined),
        new Promise((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
        }),
    ]);
    if (timer)
        clearTimeout(timer);
}
function serializeFinalOutput(value) {
    if (value === undefined)
        return undefined;
    return JSON.stringify(value);
}
export async function runAgentBrowserScript(options) {
    const compiled = validateAgentBrowserScriptSource(options.code);
    if (compiled.error) {
        return buildFailedRun({ callCount: 0, emitCount: 0, error: compiled.error, failureCategory: "validation-error", rejectedCallCount: 0, steps: [] });
    }
    const timeoutMs = options.timeoutMs ?? AGENT_BROWSER_SCRIPT_DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > AGENT_BROWSER_SCRIPT_MAX_TIMEOUT_MS) {
        return buildFailedRun({ callCount: 0, emitCount: 0, error: `script timeoutMs must be between 1 and ${AGENT_BROWSER_SCRIPT_MAX_TIMEOUT_MS}.`, failureCategory: "validation-error", rejectedCallCount: 0, steps: [] });
    }
    if (options.signal?.aborted) {
        return buildFailedRun({ aborted: true, callCount: 0, emitCount: 0, error: "Script execution was aborted.", failureCategory: "aborted", rejectedCallCount: 0, steps: [] });
    }
    let workerPath;
    try {
        workerPath = resolveScriptWorkerPath();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Compiled script worker is missing.";
        return buildFailedRun({ callCount: 0, emitCount: 0, error: message, failureCategory: "missing-binary", rejectedCallCount: 0, steps: [] });
    }
    const child = spawn(process.execPath, [
        "--permission",
        "--max-old-space-size=64",
        workerPath,
        String(AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES),
        String(AGENT_BROWSER_SCRIPT_IPC_CUMULATIVE_MAX_BYTES),
    ], {
        env: {},
        stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.on("error", () => undefined);
    let stdoutBuffer = Buffer.alloc(0);
    let stderrBytes = 0;
    let cumulativeBytes = 0;
    let callCount = 0;
    let rejectedCallCount = 0;
    let ready = false;
    let stopping = false;
    let activeCallController;
    const emissions = [];
    const steps = [];
    const failures = [];
    const messages = [];
    let draining = false;
    let drainPromise = Promise.resolve();
    let resolveResult;
    const resultPromise = new Promise((resolve) => {
        resolveResult = resolve;
    });
    const childExit = waitForChildExit(child);
    let timeout;
    let killTimer;
    const sendParentMessage = async (message) => {
        const line = `${JSON.stringify(message)}\n`;
        const bytes = Buffer.byteLength(line, "utf8");
        if (bytes > AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES || cumulativeBytes + bytes > AGENT_BROWSER_SCRIPT_IPC_CUMULATIVE_MAX_BYTES) {
            throw new Error("Script IPC limit exceeded.");
        }
        cumulativeBytes += bytes;
        await new Promise((resolve, reject) => {
            child.stdin.write(line, (error) => error ? reject(error) : resolve());
        });
    };
    const finish = async (result, waitForDrain) => {
        if (stopping)
            return;
        stopping = true;
        if (timeout)
            clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abortListener);
        activeCallController?.abort(result.timedOut ? new DOMException("Browser code deadline exceeded.", "TimeoutError") : options.signal?.reason);
        killTimer = terminateChild(child);
        // The caller holds the browser lease until dispatch actually settles.
        if (waitForDrain)
            await drainPromise.catch(() => undefined);
        await settleWithin(childExit, 1_000);
        clearTimeout(killTimer);
        resolveResult(result);
    };
    const fail = (error, failureCategory, flags = {}, waitForDrain = false) => finish(buildFailedRun({
        ...flags,
        callCount,
        emitCount: emissions.length,
        ...(emissions.length ? { data: emissions.length === 1 ? emissions[0] : emissions } : {}),
        error,
        failureCategory,
        failures,
        rejectedCallCount,
        steps,
    }), waitForDrain);
    const abortListener = () => {
        const timedOut = options.signal?.reason instanceof Error && options.signal.reason.name === "TimeoutError";
        void fail(timedOut ? "Browser code deadline exceeded." : "Browser code was aborted.", timedOut ? "timeout" : "aborted", timedOut ? { timedOut: true } : { aborted: true }, true);
    };
    options.signal?.addEventListener("abort", abortListener, { once: true });
    timeout = setTimeout(() => {
        void fail(`Script execution timed out after ${timeoutMs}ms.`, "timeout", { timedOut: true }, true);
    }, timeoutMs);
    const drainMessages = async () => {
        if (draining)
            return;
        draining = true;
        try {
            while (!stopping && messages.length > 0) {
                const message = messages.shift();
                if (message.type === "ready") {
                    if (ready) {
                        await fail("Sandbox sent a duplicate ready message.", "upstream-error");
                        return;
                    }
                    ready = true;
                    try {
                        await sendParentMessage({ code: options.code, type: "start" });
                    }
                    catch {
                        await fail("Unable to start the script sandbox.", "upstream-error");
                        return;
                    }
                    continue;
                }
                if (!ready) {
                    await fail("Sandbox sent a message before it was ready.", "upstream-error");
                    return;
                }
                if (message.type === "emit") {
                    if (!Object.hasOwn(message, "value")) {
                        await fail("emit(value) requires a JSON-serializable value; undefined and functions are not supported.", "validation-error");
                        return;
                    }
                    emissions.push(message.value);
                    continue;
                }
                if (message.type === "image") {
                    try {
                        if (!options.emitImage)
                            throw new Error("Image emission is unavailable.");
                        await options.emitImage(message.value);
                    }
                    catch (error) {
                        await fail(error instanceof Error ? error.message : "Invalid image handle.", "validation-error");
                        return;
                    }
                    continue;
                }
                if (message.type === "complete") {
                    if (message.error) {
                        await fail(describeScriptError(message.error), "script-error");
                        return;
                    }
                    const data = emissions.length === 0
                        ? message.hasValue ? message.value : undefined
                        : emissions.length === 1 ? emissions[0] : emissions;
                    let serialized;
                    try {
                        serialized = serializeFinalOutput(data);
                    }
                    catch {
                        await fail("Final script output must be JSON-serializable.", "validation-error");
                        return;
                    }
                    if (serialized !== undefined && Buffer.byteLength(serialized, "utf8") > AGENT_BROWSER_SCRIPT_FINAL_OUTPUT_MAX_BYTES) {
                        await fail(`Final script output exceeds ${AGENT_BROWSER_SCRIPT_FINAL_OUTPUT_MAX_BYTES} bytes.`, "validation-error");
                        return;
                    }
                    await finish({ callCount, data, emitCount: emissions.length, failures, ok: true, rejectedCallCount, steps }, false);
                    return;
                }
                callCount += 1;
                if (callCount > AGENT_BROWSER_SCRIPT_MAX_CALLS) {
                    await fail(`Script browser call limit exceeded (${AGENT_BROWSER_SCRIPT_MAX_CALLS}).`, "validation-error");
                    return;
                }
                const validated = validateAgentBrowserScriptBrowserParams(message.params);
                let envelope;
                if (!validated.params) {
                    rejectedCallCount += 1;
                    envelope = buildRejectedCallEnvelope(validated.error ?? "Invalid script browser call.");
                }
                else {
                    activeCallController = new AbortController();
                    try {
                        envelope = normalizeBrowserEnvelope(await options.dispatch(validated.params, activeCallController.signal));
                    }
                    catch (error) {
                        envelope = buildRejectedCallEnvelope(redactSensitiveText(error instanceof Error ? error.message : "The browser executor failed while dispatching this call."));
                    }
                    finally {
                        activeCallController = undefined;
                    }
                }
                steps.push(buildStepSummary(callCount - 1, envelope));
                if (!envelope.success)
                    failures.push({ ...envelope, index: callCount - 1 });
                if (stopping)
                    return;
                try {
                    await sendParentMessage({ envelope, id: message.id, type: "response" });
                }
                catch {
                    await fail("Unable to return a browser result within the code IPC limit. Narrow the native extraction or use agent_browser with outputPath; already-dispatched effects are not rolled back.", "upstream-error");
                    return;
                }
            }
        }
        finally {
            draining = false;
            if (!stopping && messages.length > 0)
                scheduleDrain();
        }
    };
    function scheduleDrain() {
        if (draining || stopping)
            return;
        drainPromise = drainMessages();
    }
    child.stdout.on("data", (chunk) => {
        if (stopping)
            return;
        stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
        if (stdoutBuffer.length > AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES) {
            void fail("Script IPC message limit exceeded.", "validation-error", {}, true);
            return;
        }
        for (;;) {
            const newline = stdoutBuffer.indexOf(10);
            if (newline < 0)
                break;
            const lineBuffer = stdoutBuffer.subarray(0, newline);
            stdoutBuffer = stdoutBuffer.subarray(newline + 1);
            const bytes = lineBuffer.length + 1;
            if (bytes > AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES || cumulativeBytes + bytes > AGENT_BROWSER_SCRIPT_IPC_CUMULATIVE_MAX_BYTES) {
                void fail("Script IPC limit exceeded.", "validation-error", {}, true);
                return;
            }
            cumulativeBytes += bytes;
            try {
                const parsed = JSON.parse(lineBuffer.toString("utf8"));
                if (!isScriptChildMessage(parsed))
                    throw new Error("invalid message");
                messages.push(parsed);
            }
            catch {
                void fail("Sandbox returned an invalid IPC message.", "upstream-error", {}, true);
                return;
            }
        }
        scheduleDrain();
    });
    child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.length;
        if (stderrBytes > AGENT_BROWSER_SCRIPT_IPC_MESSAGE_MAX_BYTES && !stopping) {
            void fail("Sandbox stderr limit exceeded.", "upstream-error", {}, true);
        }
    });
    child.once("error", () => {
        if (!stopping)
            void fail("Unable to start the script sandbox.", "upstream-error", {}, true);
    });
    child.once("exit", () => {
        if (!stopping)
            void fail("Script sandbox exited before completion.", "upstream-error", {}, true);
    });
    return await resultPromise;
}
