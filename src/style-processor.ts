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
  applyLayoutStyles(node, styles, parent);
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
  // a layer set to ignore auto layout already comes with the edges it is pinned
  // to, and those follow the parent as it resizes — better than a fixed offset
  if (!styles.left && !styles.right) {
    styles.left = `${roundPx(offsetWithin(node, parent, 0))}px`;
  }
  if (!styles.top && !styles.bottom) {
    styles.top = `${roundPx(offsetWithin(node, parent, 1))}px`;
  }
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

type Axis = "horizontal" | "vertical";

function applyLayoutStyles(
  node: SceneNode,
  styles: StyleRecord,
  parent?: SceneNode,
): void {
  if (styles.width && shouldUsePercentage(node)) {
    styles.width = "100%";
  }
  applyAxisSize(node, styles, "horizontal", parent);
  applyAxisSize(node, styles, "vertical", parent);
}

// Figma's Fill and Hug sizing come with no CSS of their own, so spell them out.
// Without this a filling frame hugs its text in Builder and the layout collapses.
function applyAxisSize(
  node: SceneNode,
  styles: StyleRecord,
  axis: Axis,
  parent?: SceneNode,
): void {
  const sizing = sizingOf(node, axis);
  if (!sizing) return;

  const property = axis === "horizontal" ? "width" : "height";
  if (sizing === "HUG") {
    delete styles[property];
    // the copied layer is pasted without the frame it used to hug inside, and a
    // section left to itself takes the full page width
    if (!parent && axis === "horizontal") styles.width = "fit-content";
  } else if (sizing === "FIXED") {
    const size = axis === "horizontal" ? node.width : node.height;
    styles[property] =
      axis === "horizontal" && shouldUsePercentage(node)
        ? "100%"
        : `${roundPx(size)}px`;
  } else {
    fillParent(node, styles, axis);
  }
}

function fillParent(node: SceneNode, styles: StyleRecord, axis: Axis): void {
  delete styles[axis === "horizontal" ? "width" : "height"];

  if (!flowsAlong(node.parent, axis)) {
    styles.alignSelf = "stretch";
    return;
  }
  // taking the free space along the parent's own direction is what flex-grow does
  styles.flexGrow = "1";
  styles.flexBasis = "0";
}

function sizingOf(node: SceneNode, axis: Axis): "FIXED" | "HUG" | "FILL" | undefined {
  if (usesAutoLayoutSizing(node)) {
    return axis === "horizontal"
      ? node.layoutSizingHorizontal
      : node.layoutSizingVertical;
  }
  // a frame outside auto layout always keeps the size Figma gives it
  return "layoutMode" in node ? "FIXED" : undefined;
}

// layoutSizing only means something for auto layout frames and their children
function usesAutoLayoutSizing(node: SceneNode): node is SceneNode & LayoutMixin {
  if (!("layoutSizingHorizontal" in node)) return false;
  return isAutoLayout(node) || isAutoLayout(node.parent);
}

function isAutoLayout(node: BaseNode | null): boolean {
  return !!node && "layoutMode" in node && node.layoutMode !== "NONE";
}

function flowsAlong(parent: BaseNode | null, axis: Axis): boolean {
  if (!parent || !("layoutMode" in parent)) return false;
  return parent.layoutMode === (axis === "horizontal" ? "HORIZONTAL" : "VERTICAL");
}

function shouldUsePercentage(node: SceneNode): boolean {
  if (node.width > 1000) return true;

  const parent = node.parent;
  if (!parent || !("width" in parent) || node.width !== parent.width) return false;
  // a parent that hugs takes its width from this node, so 100% would collapse both
  return sizingOf(parent as SceneNode, "horizontal") !== "HUG";
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
