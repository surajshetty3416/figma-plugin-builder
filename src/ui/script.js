"use strict";

const $ = (id) => document.getElementById(id);
const copyButton = $("copy-button");
const statusLine = $("status");
const pasteShortcut = navigator.userAgent.includes("Mac") ? "⌘V" : "Ctrl+V";
const COPIED_MS = 3000;

// Figma toasts follow the button: they change at the same moment and last as long.
// A toast without a timeout stays until the next state replaces it.
const TOASTS = {
  idle: { message: null },
  copying: { message: "Copying…" },
  copied: { message: "Copied", timeout: COPIED_MS },
  failed: { message: "Couldn't copy this selection", error: true, timeout: 4000 },
};

// Screen readers don't announce a button's label changing, so the status region does.
const ANNOUNCEMENTS = {
  idle: "",
  copying: "Copying",
  copied: `Copied. Paste using ${pasteShortcut}`,
  failed: "Couldn't copy this selection",
};

let dataToCopy = null;
let resetTimer = null;

/** Measure actual content height and tell the plugin to resize. */
function resize() {
  requestAnimationFrame(() => {
    parent.postMessage(
      { pluginMessage: { type: "resize", height: document.body.scrollHeight } },
      "*",
    );
  });
}

function getConfig() {
  return {
    stripVariables:   !$("opt-preserve-vars").checked,
    semanticHeadings:  $("opt-semantic").checked,
    inlineImages:      $("opt-inline-images").checked,
  };
}

function hasSelection() {
  return document.body.dataset.selection === "selected";
}

function isBusy() {
  return copyButton.dataset.state === "copying" || copyButton.dataset.state === "copied";
}

function showSelection(selection) {
  document.body.dataset.selection = selection ? "selected" : "empty";
  $("selection-name").textContent = selection ? selection.name : "Nothing selected";
  $("selection-detail").textContent = selection ? selection.detail : "Select a frame to copy";
  // a new selection is a new copy, so the paste note or retry for the last one goes
  if (copyButton.dataset.state !== "copying") showCopyState("idle");
  resize();
}

// The button's face for each state is picked in CSS from data-state.
function showCopyState(state) {
  clearTimeout(resetTimer);
  copyButton.dataset.state = state;
  copyButton.disabled = !hasSelection() || isBusy();
  statusLine.textContent = ANNOUNCEMENTS[state];
  parent.postMessage({ pluginMessage: { type: "notify", ...TOASTS[state] } }, "*");
  resize();
  if (state === "copied") {
    resetTimer = setTimeout(() => showCopyState("idle"), COPIED_MS);
  }
}

copyButton.addEventListener("click", () => {
  parent.postMessage(
    { pluginMessage: { type: "copy-data", config: getConfig() } },
    "*",
  );
});

onmessage = (event) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;
  switch (msg.type) {
    case "no-selection":
      showSelection(null);
      break;
    case "selection":
      showSelection(msg.message);
      break;
    case "copying":
      showCopyState("copying");
      break;
    case "copy-to-clipboard":
      dataToCopy = msg.message;
      if (!document.execCommand("copy")) showCopyState("failed");
      break;
    case "copied":
      if (copyButton.dataset.state === "failed") break;
      showCopyState("copied");
      break;
    case "copy-failed":
      showCopyState("failed");
      break;
  }
};

document.addEventListener("copy", (event) => {
  if (!dataToCopy) return;
  const json = JSON.stringify({ blocks: dataToCopy, components: [], variables: [] });

  // Figma desktop runs on Chromium, and Firefox can't read Chromium's custom clipboard
  // types, so the blocks are also written as HTML, which Builder reads when needed.
  const span = document.createElement("span");
  span.setAttribute("data-builder-copied-blocks", json);

  event.clipboardData.setData("builder-copied-blocks", json);
  event.clipboardData.setData("text/html", span.outerHTML);
  event.preventDefault();
});

$("paste-hint").textContent = `Paste using ${pasteShortcut}`;
showCopyState("idle");
