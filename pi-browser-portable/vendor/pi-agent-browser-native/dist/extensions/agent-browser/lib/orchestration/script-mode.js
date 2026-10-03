import { stat } from "node:fs/promises";
import { AGENT_BROWSER_SCRIPT_FINAL_OUTPUT_MAX_BYTES, createAgentBrowserScriptCloseArgs, isAgentBrowserScriptSessionName, } from "../input-modes/script.js";
import { isRecord } from "../parsing.js";
import { redactSensitiveText } from "../runtime.js";
import { attachInlineImage } from "../results/presentation/artifacts.js";
import { projectAgentBrowserObservation } from "../results/presentation/content.js";
import { redactPresentationData } from "../results/presentation/diagnostics.js";
const SCRIPT_SESSION_ENTRY_TYPE = "agent-browser-script-session";
// Retire outstanding pre-0.7 isolated-session leases when an old transcript resumes.
export function getScriptSessionLeasesFromBranch(branch) {
    const leases = new Map();
    for (const entry of branch) {
        if (!isRecord(entry) || entry.type !== "custom" || entry.customType !== SCRIPT_SESSION_ENTRY_TYPE || !isRecord(entry.data))
            continue;
        const { cleanup, closeCommandArgs, launchAttempted, sessionName } = entry.data;
        if (!isAgentBrowserScriptSessionName(sessionName))
            continue;
        const expected = createAgentBrowserScriptCloseArgs(sessionName);
        if ((cleanup !== "active" && cleanup !== "closed" && cleanup !== "failed") || launchAttempted !== true
            || !Array.isArray(closeCommandArgs) || closeCommandArgs.length !== expected.length
            || !closeCommandArgs.every((token, index) => token === expected[index]))
            continue;
        leases.set(sessionName, { cleanup, closeCommandArgs: expected, launchAttempted: true, sessionName });
    }
    return leases;
}
export function appendScriptSessionLease(pi, sessionName, cleanup) {
    pi.appendEntry(SCRIPT_SESSION_ENTRY_TYPE, { cleanup, closeCommandArgs: createAgentBrowserScriptCloseArgs(sessionName), launchAttempted: true, sessionName });
}
export function createBrowserCodeOutput() {
    const images = new Map();
    const selected = new Map();
    const receipts = new Map();
    const fileArtifacts = new Map();
    let selectedBytes = 0;
    return {
        async observe(result) {
            const details = isRecord(result.details) ? result.details : {};
            const observation = projectAgentBrowserObservation(details, result.isError !== true);
            for (const entry of observation.artifactVerification?.artifacts ?? [])
                receipts.set(entry.absolutePath ?? entry.path, entry);
            for (const artifact of observation.artifacts ?? [])
                fileArtifacts.set(artifact.absolutePath, artifact);
            if (observation.imageObservations) {
                observation.imageObservations = await Promise.all(observation.imageObservations.map(async (image) => {
                    const file = await stat(image.path);
                    const id = `image-${images.size + 1}`;
                    images.set(id, { observation: image, size: file.size, mtime: file.mtimeMs });
                    return { ...image, id };
                }));
            }
            return observation;
        },
        async emitImage(value) {
            const id = isRecord(value) && typeof value.id === "string" ? value.id : undefined;
            const image = id ? images.get(id) : undefined;
            if (!id || !image)
                throw new Error("emitImage expects an imageObservations handle returned by browser() in this code call.");
            if (selected.has(id))
                return;
            if (selected.size >= 8 || selectedBytes + image.size > 20 * 1_024 * 1_024)
                throw new Error("Selected images exceed the code output limit (8 images / 20 MiB). Emit fewer images.");
            const file = await stat(image.observation.path);
            if (!file.isFile() || file.size !== image.size || file.mtimeMs !== image.mtime)
                throw new Error("The selected image changed since capture. Capture it again before emitting it.");
            const presentation = await attachInlineImage({ content: [], summary: "Selected browser image" }, image.observation.path);
            if (!presentation.content.some(item => item.type === "image")) {
                throw new Error(presentation.content.filter(item => item.type === "text").map(item => item.text).join("\n") || "The selected image could not be attached.");
            }
            selected.set(id, presentation.content.filter(item => item.type === "image"));
            selectedBytes += file.size;
        },
        async finish(run, sessionName, namespace) {
            let data;
            let outputError;
            try {
                data = redactPresentationData({ command: "code" }, run.data);
                if (data !== undefined && Buffer.byteLength(JSON.stringify(data), "utf8") > AGENT_BROWSER_SCRIPT_FINAL_OUTPUT_MAX_BYTES)
                    throw new Error("oversized");
            }
            catch {
                data = undefined;
                outputError = "Code output could not be rendered as bounded JSON.";
            }
            const failureCategory = outputError ? "validation-error" : run.failureCategory
                ?? (run.rejectedCallCount > 0 ? "validation-error" : undefined);
            const success = run.ok && failureCategory === undefined;
            const artifacts = [...receipts.values()];
            const count = (state) => artifacts.filter(entry => entry.state === state).length;
            const artifactVerification = artifacts.length ? {
                artifacts, missingCount: count("missing"), pendingCount: count("pending"), unverifiedCount: count("unverified"),
                verifiedCount: count("verified"), verified: artifacts.every(entry => entry.state === "verified"),
            } : undefined;
            const observation = {
                success, resultCategory: success ? "success" : "failure", failureCategory, data,
                error: outputError ?? (run.error ? redactSensitiveText(run.error) : undefined),
                sessionName, namespace,
                codeRun: { callCount: run.callCount, emitCount: run.emitCount, failedCallCount: run.steps.filter(step => !step.ok).length, rejectedCallCount: run.rejectedCallCount, aborted: run.aborted, timedOut: run.timedOut },
                failures: run.failures?.length ? run.failures : undefined,
                artifactVerification,
                artifacts: fileArtifacts.size ? [...fileArtifacts.values()] : undefined,
                imageObservations: [...selected.keys()].map(id => ({ ...images.get(id).observation, id })),
            };
            const summary = success ? `Browser code completed (${run.callCount} calls).` : "Browser code failed.";
            return {
                content: [...selected.values()].flat(),
                details: { ...observation, codeSteps: run.steps, summary },
                isError: !success,
            };
        },
    };
}
