import { config } from "./config";

// Module-level constants — not recreated on every call
const CONTAINER_TYPES = new Set(["INSTANCE", "FRAME", "GROUP"]);
const VECTOR_TYPES = new Set([
  "VECTOR",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
]);

// TEXT is handled before this map is reached; other entries are exhaustive.
const ELEMENT_MAP: Record<string, string> = {
  FRAME: "section",
  GROUP: "section",
  INSTANCE: "div",
  COMPONENT: "div",
  LINE: "hr",
};

export function isSVG(node: SceneNode, pure = false): boolean {
  if (!pure && CONTAINER_TYPES.has(node.type) && "children" in node) {
    return node.children.every((child) => isSVG(child, true));
  }
  return VECTOR_TYPES.has(node.type) && !isImage(node);
}

export function isImage(node: SceneNode): boolean {
  return (
    "fills" in node &&
    Array.isArray(node.fills) &&
    node.fills.some((fill) => fill.type === "IMAGE") &&
    !hasChildren(node)
  );
}

export function hasChildren(node: SceneNode): boolean {
  return "children" in node && node.children.length > 0;
}

export function getElementType(node: SceneNode): string {
  if (isImage(node)) return "img";
  if (isSVG(node)) return "svg";

  if (node.type === "TEXT") {
    return config.semanticHeadings ? headingTagForText(node as TextNode) : "p";
  }

  return ELEMENT_MAP[node.type] ?? "div";
}

/**
 * Resolves a semantic HTML tag for a text node.
 * Priority: explicit name (h1–h6 / p) → font-size thresholds.
 */
function headingTagForText(node: TextNode): string {
  const name = (node.name ?? "").trim().toLowerCase();
  if (/^h[1-6]$/.test(name)) return name;
  if (name === "p" || name === "paragraph" || name === "body") return "p";

  const size = typeof node.fontSize === "number" ? node.fontSize : 0;
  if (size >= 44) return "h1";
  if (size >= 33) return "h2";
  if (size >= 26) return "h3";
  if (size >= 21) return "h4";
  if (size >= 18) return "h5";
  return "p";
}
