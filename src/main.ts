import { updateConfig } from "./config";
import { convertToJSON } from "./converter";
import { clearImageCache } from "./image-cache";
import type { Block, MessageTypes, SelectionSummary } from "./types";

figma.showUI(__html__, { width: 240, height: 180, themeColors: true });
informSelection();
figma.on("selectionchange", informSelection);

// The UI asks for a toast whenever its copy state changes, so only one shows at a time.
let toast: NotificationHandler | undefined;

figma.ui.onmessage = async (msg: MessageTypes) => {
  if (msg.type === "resize") {
    figma.ui.resize(240, msg.height);
  } else if (msg.type === "notify") {
    toast?.cancel();
    toast = msg.message
      ? figma.notify(msg.message, { error: msg.error, timeout: msg.timeout ?? Infinity })
      : undefined;
  } else if (msg.type === "copy-data") {
    if (msg.config) updateConfig(msg.config);
    await handleCopyData();
  }
};

function informSelection(): void {
  const nodes = figma.currentPage.selection;
  if (nodes.length === 0) {
    figma.ui.postMessage({ type: "no-selection" } satisfies MessageTypes);
    return;
  }
  figma.ui.postMessage({
    type: "selection",
    message: describeSelection(nodes),
  } satisfies MessageTypes);
}

function describeSelection(nodes: readonly SceneNode[]): SelectionSummary {
  if (nodes.length > 1) {
    return { name: `${nodes.length} layers`, detail: "Multiple layers" };
  }
  const type = nodes[0].type.replace(/_/g, " ").toLowerCase();
  return { name: nodes[0].name, detail: type.charAt(0).toUpperCase() + type.slice(1) };
}

async function handleCopyData(): Promise<void> {
  figma.ui.postMessage({ type: "copying" } satisfies MessageTypes);

  clearImageCache(); // reset per-conversion cache before each run

  try {
    const result: Block[] = await convertToJSON();
    figma.ui.postMessage({
      type: "copy-to-clipboard",
      message: result,
    } satisfies MessageTypes);
    figma.ui.postMessage({ type: "copied" } satisfies MessageTypes);
  } catch (error) {
    figma.ui.postMessage({ type: "copy-failed" } satisfies MessageTypes);
    console.error(error);
  }
}
