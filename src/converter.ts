import {
  getClipPathStyle,
  getSVGFromVector,
  handleImageNode,
  setBackgroundImage,
} from "./image-handlers";
import { getElementType, isImage, isSVG } from "./node-helpers";
import { cleanUpValue, getBaseStyles, getRawStyles } from "./style-processor";
import type { Block, StyleRecord } from "./types";
import { escapeHTML } from "./utils";

// ─── Public API ─────────────────────────────────────────────────────────────

export async function convertToJSON(): Promise<Block[]> {
  return Promise.all(figma.currentPage.selection.map((node) => convertNode(node)));
}

// ─── Node conversion ─────────────────────────────────────────────────────────

// `parent` is only passed for layers inside the copied selection, so the copied
// root is never positioned against a layer that isn't part of the paste.
async function convertNode(node: SceneNode, parent?: SceneNode): Promise<Block> {
  // Fetch children and CSS concurrently — getCSSAsync can resolve while the
  // subtree is being processed, giving a meaningful speedup on deep frames.
  const [children, nodeStyles] = await Promise.all([
    collectChildren(node),
    node.getCSSAsync(),
  ]);

  const css = cleanStyles(nodeStyles);
  const baseStyles = getBaseStyles(node, css, parent);
  const rawStyles = getRawStyles(css);
  const element = getElementType(node);

  const block: Block = {
    children,
    baseStyles,
    rawStyles,
    originalElement: element === "svg" ? "__raw_html__" : "",
    mobileStyles: {},
    tabletStyles: {},
    attributes: {},
    classes: [],
    innerHTML: "",
    innerText: "",
    dataKey: null,
    element,
    blockName: node.name,
    customAttributes: {},
  };

  applyMaskClipPaths(node, block);
  await populateContent(node, block);

  return block;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function collectChildren(node: SceneNode): Promise<Block[]> {
  if (isSVG(node) || isImage(node) || !("children" in node)) return [];

  const visible = node.children.filter(
    (child) => child.visible && !(child.type === "VECTOR" && child.isMask),
  );
  return Promise.all(visible.map((child) => convertNode(child, node)));
}

function cleanStyles(raw: Record<string, string>): StyleRecord {
  const result: StyleRecord = {};
  for (const [k, v] of Object.entries(raw)) result[k] = cleanUpValue(v);
  return result;
}

function applyMaskClipPaths(node: SceneNode, block: Block): void {
  const mask = node.parent?.children.find(
    (s): s is VectorNode => s.type === "VECTOR" && (s as VectorNode).isMask,
  );
  if (mask) block.baseStyles["clip-path"] = getClipPathStyle(mask);
}

async function populateContent(node: SceneNode, block: Block): Promise<void> {
  if (node.type === "TEXT") {
    block.innerHTML = escapeHTML(node.characters);
  } else if (block.element === "svg") {
    block.innerHTML = await getSVGFromVector(node);
  } else if (block.element === "img") {
    await handleImageNode(node, block);
  } else {
    await setBackgroundImage(node, block);
  }
}
