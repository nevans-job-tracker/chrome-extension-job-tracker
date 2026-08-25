import { extractJobPosting } from "./adapters/index.js";

const listenerKey = "__jobTrackerExtractorListenerInstalled";

if (!globalThis[listenerKey]) {
  globalThis[listenerKey] = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTRACT_CURRENT_JOB") return undefined;
    sendResponse(extractJobPosting());
    return false;
  });
}
