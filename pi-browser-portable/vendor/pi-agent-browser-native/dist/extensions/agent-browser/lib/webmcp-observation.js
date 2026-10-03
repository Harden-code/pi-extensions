import { AsyncLocalStorage } from "node:async_hooks";
import { isRecord } from "./parsing.js";
const observation = new AsyncLocalStorage();
export function getNativeWebMcpCatalog(data) {
    if (Array.isArray(data)) {
        for (let index = data.length - 1; index >= 0; index -= 1) {
            const catalog = getNativeWebMcpCatalog(isRecord(data[index]) ? data[index].result : undefined);
            if (catalog)
                return catalog;
        }
    }
    if (!isRecord(data) || !isRecord(data.webmcp))
        return undefined;
    return Array.isArray(data.webmcp.tools) || data.webmcp.status === "unavailable" ? data.webmcp : undefined;
}
export function observeNativeWebMcp(data) {
    const current = observation.getStore();
    if (!current)
        return;
    const catalog = getNativeWebMcpCatalog(data);
    if (catalog)
        current.catalog = catalog;
}
/** Native discovery is edge-triggered; helper reads must not swallow its updates. */
export async function collectNativeWebMcp(run) {
    const current = {};
    return observation.run(current, async () => ({ result: await run(), catalog: current.catalog }));
}
