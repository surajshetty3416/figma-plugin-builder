"use strict";

let dataToCopy = null;
const $ = (id) => document.getElementById(id);
const btn = $("copy-button");
const noFrame   = $("no-frame");
const copyPanel = $("copy");

/** Measure actual content height and tell the plugin to resize. */
function resize() {
  requestAnimationFrame(() => {
    parent.postMessage(
      { pluginMessage: { type: "resize", height: document.body.scrollHeight } },
      "*",
    );
  });
}

$("opts-details").addEventListener("toggle", resize);

function getConfig() {
  return {
    stripVariables:   !$("opt-preserve-vars").checked,
    semanticHeadings:  $("opt-semantic").checked,
    inlineImages:      $("opt-inline-images").checked,
  };
}

btn.addEventListener("click", () => {
  parent.postMessage(
    { pluginMessage: { type: "copy-data", config: getConfig() } },
    "*",
  );
});

onmessage = (event) => {
  const msg = event.data.pluginMessage;
  switch (msg.type) {
    case "no-selection":
      noFrame.style.display = "flex";
      copyPanel.style.display = "none";
      resize();
      break;
    case "selection":
      noFrame.style.display = "none";
      copyPanel.style.display = "flex";
      $("frame-name").textContent = msg.message;
      resize();
      break;
    case "copy-to-clipboard":
      dataToCopy = msg.message;
      document.execCommand("copy");
      break;
    case "copying":
      btn.disabled = true;
      btn.textContent = "Copying\u2026";
      break;
    case "copied":
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy Frame"; btn.disabled = false; }, 2000);
      break;
  }
};

document.addEventListener("copy", (event) => {
  if (!dataToCopy) return;
  event.clipboardData.setData(
    "builder-copied-blocks",
    JSON.stringify({ blocks: dataToCopy, components: [], variables: [] }),
  );
  event.preventDefault();
});

// Size the window to fit content immediately on load (before any plugin messages arrive).
resize();
