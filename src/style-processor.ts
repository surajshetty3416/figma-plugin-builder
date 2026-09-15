import { config } from "./config";
import { BASE_STYLE_PROPERTIES, BASE_STYLE_SET } from "./constants";
import { isFreeformContainer, isImage, isSVG } from "./node-helpers";
import type { StyleRecord } from "./types";
import { kebabToCamelCase, rgbToRGBAString, stripCSSVariables } from "./utils";

// ─── Public API ─────────────────────────────────────────────────────────────

export function cleanUpValue(value: string): string {
  // Strip CSS comments
  value = value.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
  return config.stripVariables ? stripCSSVariables(value) : value;
}

export function getBaseStyles(
  node: SceneNode,
  css: StyleRecord,
  parent?: SceneNode,
): StyleRecord {
  // Single pass: pick allowed keys, then apply mutations.
  const styles: StyleRecord = {};
  for (const key of BASE_STYLE_PROPERTIES) {
    if (key in css) styles[key] = css[key];
  }

  applyNodeSpecificStyles(node, styles, parent);

  // Convert kebab keys to camelCase in a single pass.
  const result: StyleRecord = {};
  for (const key of Object.keys(styles)) {
    result[kebabToCamelCase(key)] = styles[key];
  }
  return result;
}

export function getRawStyles(css: StyleRecord): StyleRecord {
  // Single pass: skip base props and well-known defaults, camelCase the rest.
  const result: StyleRecord = {};
  for (const [key, value] of Object.entries(css)) {
    if (BASE_STYLE_SET.has(key)) continue;
    if (key === "font-style" && value === "normal") continue;
    if (key === "font-weight" && value === "400") continue;
    result[kebabToCamelCase(key)] = value;
  }
  return result;
}

// ─── Node-specific style mutations ──────────────────────────────────────────

function applyNodeSpecificStyles(
  node: SceneNode,
  styles: StyleRecord,
  parent?: SceneNode,
): void {
  if ("visible" in node && !node.visible) {
    styles.display = "none";
  }

  if ("font-family" in styles) {
    styles["font-family"] = (styles["font-family"] as string).replace(/"/g, "");
  }

  if (node.type === "FRAME" && "clipsContent" in node && node.clipsContent) {
    styles.overflowX = "hidden";
    styles.overflowY = "hidden";
  }

  if (isImage(node) && (styles.background as string)?.includes("url(<path")) {
    delete styles.background;
  }

  applyPositionStyles(node, parent, styles);
  applyLayoutStyles(node, styles);
  applyFillStyles(node, styles);
  applyStrokeStyles(node, styles);
}

// ─── Position ───────────────────────────────────────────────────────────────

// Layers in a group, in a frame without auto layout, or set to ignore auto layout keep
// their Figma position. Without it Builder lays them out in flow and stacks them.
function applyPositionStyles(
  node: SceneNode,
  parent: SceneNode | undefined,
  styles: StyleRecord,
): void {
  if (hasPositionedChildren(node)) {
    if (!styles.position || styles.position === "static") styles.position = "relative";
    // positioned children take no space, so the container keeps its Figma size
    styles.width ??= `${node.width}px`;
    styles.height ??= `${node.height}px`;
  }
  if (!parent || !isPositionedIn(node, parent)) return;

  styles.position = "absolute";
  styles.left = `${roundPx(offsetWithin(node, parent, 0))}px`;
  styles.top = `${roundPx(offsetWithin(node, parent, 1))}px`;
}

function isPositionedIn(node: SceneNode, parent: BaseNode): boolean {
  if (isFreeformContainer(parent)) return true;
  return "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";
}

function hasPositionedChildren(node: SceneNode): boolean {
  return (
    "children" in node &&
    node.children.some((child) => child.visible && isPositionedIn(child, node))
  );
}

// absoluteTransform is in page coordinates, which also covers groups: a group's
// children measure x and y from the group's parent, not from the group.
function offsetWithin(node: SceneNode, parent: SceneNode, axis: 0 | 1): number {
  return node.absoluteTransform[axis][2] - parent.absoluteTransform[axis][2];
}

function roundPx(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

function applyLayoutStyles(node: SceneNode, styles: StyleRecord): void {
  if (styles.width && shouldUsePercentage(node)) {
    styles.width = "100%";
  }
  if (!("layoutMode" in node)) return;

  const layoutMode = ["AUTO", "NONE"].includes(node.layoutMode ?? "AUTO")
    ? "VERTICAL"
    : node.layoutMode;
  const isHorizontal = layoutMode === "HORIZONTAL";

  if (isHorizontal) {
    if (node.counterAxisSizingMode === "FIXED")
      styles.height = `${node.height}px`;
    if (node.primaryAxisSizingMode === "FIXED") {
      styles.width = shouldUsePercentage(node) ? "100%" : `${node.width}px`;
    }
  } else {
    if (node.counterAxisSizingMode === "FIXED") {
      styles.width = shouldUsePercentage(node) ? "100%" : `${node.width}px`;
    }
    if (node.primaryAxisSizingMode === "FIXED")
      styles.height = `${node.height}px`;
  }
}

function shouldUsePercentage(node: SceneNode): boolean {
  // @ts-expect-error: parent property exists at runtime
  return node.width > 1000 || (node.parent && node.width === node.parent.width);
}

// ─── Fills ───────────────────────────────────────────────────────────────────

function applyFillStyles(node: SceneNode, styles: StyleRecord): void {
  if (!("fills" in node) || !node.fills || typeof node.fills === "symbol")
    return;
  // SVG fills are baked into the exported markup — skip background entirely.
  if (isSVG(node)) return;

  const solidFill = node.fills.find(
    (fill) => fill.type === "SOLID" && fill.visible,
  ) as SolidPaint | undefined;
  if (!solidFill) return;

  const color = rgbToRGBAString(solidFill.color, solidFill.opacity);
  styles[node.type === "TEXT" ? "color" : "background"] = color;
}

// ─── Strokes ─────────────────────────────────────────────────────────────────

function applyStrokeStyles(node: SceneNode, styles: StyleRecord): void {
  if (!("strokes" in node) || !Array.isArray(node.strokes)) return;

  const visibleStroke = node.strokes.find(
    (s) => s.visible && s.type === "SOLID",
  ) as SolidPaint | undefined;
  if (!visibleStroke) return;

  const weight =
    "strokeWeight" in node && typeof node.strokeWeight === "number"
      ? node.strokeWeight
      : 1;

  styles["border-width"] = `${weight}px`;
  styles["border-style"] = "solid";
  styles["border-color"] = rgbToRGBAString(
    visibleStroke.color,
    visibleStroke.opacity ?? 1,
  );

  if ("strokeAlign" in node && node.strokeAlign === "INSIDE") {
    styles.boxSizing = "border-box";
  }
}
