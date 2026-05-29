import { updateConfig } from "./config";
import { convertToJSON } from "./converter";
import { clearImageCache } from "./image-cache";
import type { Block, MessageTypes } from "./types";

figma.showUI(__html__, { width: 240, height: 180, themeColors: true });
informSelection();
figma.on("selectionchange", informSelection);

figma.ui.onmessage = async (msg: MessageTypes) => {
  if (msg.type === "resize") {
    figma.ui.resize(240, msg.height);
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
  const label =
    nodes.length === 1 ? nodes[0].name : `${nodes.length} frames selected`;
  figma.ui.postMessage({
    type: "selection",
    message: label,
  } satisfies MessageTypes);
}

async function handleCopyData(): Promise<void> {
  figma.notify("Copying...");
  figma.ui.postMessage({ type: "copying" } satisfies MessageTypes);

  clearImageCache(); // reset per-conversion cache before each run

  try {
    const result: Block[] = await convertToJSON();
    figma.ui.postMessage({
      type: "copy-to-clipboard",
      message: result,
    } satisfies MessageTypes);
    figma.ui.postMessage({ type: "copied" } satisfies MessageTypes);
    figma.notify("Copied to clipboard!");
  } catch (error) {
    figma.notify("Error copying data");
    console.error(error);
  }
}
