// Types
type MessageTypes =
  | { type: "no-selection" }
  | { type: "selection"; message: string }
  | { type: "copying" }
  | { type: "copied" }
  | { type: "copy-data" }
  | { type: "copy-to-clipboard"; message: Block[] };

type Block = {
  children: Block[];
  baseStyles: StyleRecord;
  originalElement: string;
  rawStyles: StyleRecord;
  blockName?: string;
  mobileStyles: StyleRecord;
  tabletStyles: StyleRecord;
  attributes: StyleRecord;
  classes: string[];
  innerHTML?: string;
  innerText?: string;
  dataKey: string | null;
  element: string;
  customAttributes: StyleRecord;
};

type StyleRecord = Record<string, string | number>;

// Constants
const BASE_STYLE_PROPERTIES = [
  "position",
  "border",
  "top",
  "right",
  "bottom",
  "left",
  "display",
  "flex-direction",
  "gap",
  "justify-content",
  "align-items",
  "width",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "height",
  "border-radius",
  "border-width",
  "border-color",
  "background",
  "color",
  "font-size",
  "font-family",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-decoration",
  "text-transform",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "box-shadow",
  "opacity",
  "object-fit",
  "align-self",
  "font-weight",
];

// Main Plugin Setup
figma.showUI(__html__);
informSelection();
figma.on("selectionchange", informSelection);

// Message Handlers
figma.ui.onmessage = async (msg: MessageTypes) => {
  if (msg.type === "copy-data") {
    await handleCopyData();
  }
};

// Core Functions
function informSelection() {
  const nodes = figma.currentPage.selection;
  const message: MessageTypes =
    nodes.length === 0
      ? { type: "no-selection" }
      : { type: "selection", message: nodes[0].name };
  figma.ui.postMessage(message);
}

async function handleCopyData() {
  figma.notify("Copying...");
  figma.ui.postMessage({ type: "copying" });

  try {
    const result = await convertToJSON();
    figma.ui.postMessage({
      type: "copy-to-clipboard",
      message: result,
    });
    figma.ui.postMessage({ type: "copied" });
    figma.notify("Copied to clipboard!");
  } catch (error) {
    figma.notify("Error copying data");
    console.error(error);
  }
}

async function convertToJSON(): Promise<Block[]> {
  const pages = figma.currentPage.selection;
  return Promise.all(pages.map(convertPage));
}

async function convertPage(page: SceneNode): Promise<Block> {
  return convertNode(page);
}

async function convertNode(node: SceneNode): Promise<Block> {
  const children =
    !(isSVG(node) || isImage(node)) && "children" in node
      ? await Promise.all(
          node.children
            .filter(
              (child) =>
                child.visible && !(child.type === "VECTOR" && child.isMask)
            )
            .map(convertNode)
        )
      : [];

  const nodeStyles = await node.getCSSAsync();
  const cleanedStyles = Object.keys(nodeStyles).reduce(
    (acc, k) => ({
      ...acc,
      [k]: cleanUpValue(nodeStyles[k]),
    }),
    {}
  );

  const baseStyles = await getBaseStyles(node, cleanedStyles);
  const rawStyles = await getRawStyles(node, cleanedStyles);
  const element = getElementType(node);

  const baseNode: Block = {
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

  // if sibling are of type mask, convert mask to clip path
  // find siblings of type mask
  node.parent?.children.forEach((child) => {
    if (child.type === "VECTOR" && child.isMask) {
      // baseNode.baseStyles["mask"] = getMaskStyle(child as VectorNode);
      baseNode.baseStyles["clip-path"] = getClipPathStyle(child as VectorNode);
    }
  });

  await updateNodeContent(node, baseNode);
  return baseNode;
}

// Helper Functions
function kebabToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
}

function isSVG(node: SceneNode, pure = false): boolean {
  if (
    ["INSTANCE", "FRAME", "GROUP"].includes(node.type) &&
    "children" in node &&
    !pure
  ) {
    return node.children.every((child) => isSVG(child, true));
  }
  return (
    ["VECTOR", "ELLIPSE", "POLYGON", "STAR", "BOOLEAN_OPERATION"].includes(
      node.type
    ) && !isImage(node)
  );
}

function isImage(node: SceneNode): boolean {
  return (
    "fills" in node &&
    Array.isArray(node.fills) &&
    node.fills.some((fill) => fill.type === "IMAGE") &&
    !hasChildren(node)
  );
}

function hasChildren(node: SceneNode): boolean {
  return "children" in node && node.children.length > 0;
}

async function updateNodeContent(node: SceneNode, baseNode: Block) {
  if (node.type === "TEXT") {
    baseNode.innerText = node.characters;
  } else if (baseNode.element === "svg") {
    baseNode.innerHTML = await getSVGFromVector(node);
  } else if (baseNode.element === "img") {
    await handleImageNode(node, baseNode);
  } else {
    await setBackgroundImage(node, baseNode);
  }
}

async function handleImageNode(node: SceneNode, baseNode: Block) {
  if (!("fills" in node) || !Array.isArray(node.fills)) return;

  // Find any image fill
  const imageFill = node.fills?.find(
    (fill): fill is ImagePaint => fill.type === "IMAGE" && fill.visible
  );
  if (!imageFill?.imageHash) return;

  try {
    const image = figma.getImageByHash(imageFill.imageHash);
    if (!image) return;

    const bytes = await image.getBytesAsync();
    if (!bytes || bytes.length === 0) return;

    const url = `data:image/png;base64,${figma.base64Encode(bytes)}`;
    baseNode.attributes.src = url;

    // Handle image transformations
    if (imageFill.scaleMode === "FILL") {
      baseNode.baseStyles.objectFit = "cover";
    } else if (imageFill.scaleMode === "FIT") {
      baseNode.baseStyles.objectFit = "contain";
    }

    // Handle rotation
    if (imageFill.rotation) {
      baseNode.baseStyles.transform = `rotate(${imageFill.rotation}deg)`;
    }

    // Handle opacity
    if (imageFill.opacity !== undefined && imageFill.opacity !== 1) {
      baseNode.baseStyles.opacity = imageFill.opacity;
    }
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

async function setBackgroundImage(node: SceneNode, baseNode: Block) {
  if (!("fills" in node) || !Array.isArray(node.fills)) return;

  const imageFill = node.fills.find(
    (fill) => fill.type === "IMAGE" && fill.visible
  ) as ImagePaint;
  if (!imageFill || !imageFill.imageHash) return;

  const image = figma.getImageByHash(imageFill.imageHash);
  if (!image) return;

  const bytes = await image.getBytesAsync();
  if (!bytes || bytes.length === 0) return;

  const url = `data:image/png;base64,${figma.base64Encode(bytes)}`;
  const bgSize =
    imageFill.scaleMode === "FILL"
      ? "cover"
      : imageFill.scaleMode === "FIT"
      ? "contain"
      : "auto";
  baseNode.baseStyles.background = `url(${url}) center center / ${bgSize} no-repeat`;
}

async function getSVGFromVector(node: SceneNode): Promise<string> {
  if (!isSVG(node)) return "";

  try {
    const svgData = await node.exportAsync({ format: "SVG" });
    return String.fromCharCode.apply(null, svgData as unknown as number[]);
  } catch (error) {
    console.error("Error exporting node to SVG:", error);
    return "";
  }
}

function getElementType(node: SceneNode): string {
  if (isImage(node)) return "img";
  if (isSVG(node)) return "svg";

  const elementMap: Record<string, string> = {
    TEXT: "p",
    FRAME: "section",
    GROUP: "section",
    INSTANCE: "div",
    COMPONENT: "div",
    LINE: "hr",
  };

  return elementMap[node.type] || "div";
}

function rgbToRGBAString(color: RGB, opacity = 1): string {
  const rgb = [color.r, color.g, color.b].map((c) => Math.round(c * 255));
  return opacity < 1
    ? `rgba(${rgb.join(", ")}, ${opacity})`
    : `rgb(${rgb.join(", ")})`;
}

function cleanUpValue(value: string): string {
  value = value.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
  return stripCSSVariables(value);
}

function stripCSSVariables(value: string): string {
  return value.replace(/var\(([^)]+),([^)]+)\)/, "$2");
}

// Style Processing Functions
async function getBaseStyles(
  node: SceneNode,
  css: StyleRecord
): Promise<StyleRecord> {
  const styles = BASE_STYLE_PROPERTIES.reduce((acc, key) => {
    if (key in css) acc[key] = css[key];
    return acc;
  }, {} as StyleRecord);

  await processNodeSpecificStyles(node, styles);
  return Object.keys(styles).reduce(
    (acc, k) => ({
      ...acc,
      [kebabToCamelCase(k)]: styles[k],
    }),
    {}
  );
}

async function processNodeSpecificStyles(node: SceneNode, styles: StyleRecord) {
  if ("visible" in node) {
    styles.display = node.visible ? styles.display : "none";
  }

  if ("font-family" in styles) {
    styles["font-family"] = (styles["font-family"] as string).replace(/"/g, "");
  }

  if (node.type === "FRAME" && "clipsContent" in node && node.clipsContent) {
    styles.overflowX = "hidden";
    styles.overflowY = "hidden";
  }

  if (isImage(node)) {
    if ((styles.background as string).includes("url(<path")) {
      delete styles.background;
    }
  }

  if (
    (!styles.position || styles.position === "static") &&
    "children" in node &&
    node.children.some(
      (child) =>
        (child.x || child.y) &&
        (child as FrameNode)?.layoutPositioning === "ABSOLUTE"
    )
  ) {
    styles.position = "relative";
  }

  processLayoutStyles(node, styles);
  await processFillStyles(node, styles);
}

async function getRawStyles(
  node: SceneNode,
  css: StyleRecord
): Promise<StyleRecord> {
  const defaultStyles = {
    "font-style": "normal",
    "font-weight": "400",
  } as const;

  const styles = Object.keys(css)
    .map((key) => [key, css[key]] as const)
    .filter(([key]) => !BASE_STYLE_PROPERTIES.includes(key))
    .filter(
      ([key, value]) =>
        !(
          key in defaultStyles &&
          value === defaultStyles[key as keyof typeof defaultStyles]
        )
    )
    .reduce((acc, [k, v]) => ({ ...acc, [kebabToCamelCase(k)]: v }), {});

  return styles;
}

function processLayoutStyles(node: SceneNode, styles: StyleRecord) {
  if (styles.width && shouldUsePercentage(node)) {
    styles.width = "100%";
  }
  if (!("layoutMode" in node)) return;

  const layoutMode = ["AUTO", "NONE"].includes(node?.layoutMode || "AUTO")
    ? "VERTICAL"
    : node.layoutMode;
  const isHorizontal = layoutMode === "HORIZONTAL";

  if (isHorizontal) {
    if (node.counterAxisSizingMode === "FIXED") {
      styles.height = `${node.height}px`;
    }
    if (node.primaryAxisSizingMode === "FIXED") {
      styles.width = shouldUsePercentage(node) ? "100%" : `${node.width}px`;
    }
  } else {
    if (node.counterAxisSizingMode === "FIXED") {
      styles.width = shouldUsePercentage(node) ? "100%" : `${node.width}px`;
    }
    if (node.primaryAxisSizingMode === "FIXED") {
      styles.height = `${node.height}px`;
    }
  }
}

function shouldUsePercentage(node: SceneNode): boolean {
  // @ts-expect-error: parent property exists at runtime
  return node.width > 1000 || (node.parent && node.width === node.parent.width);
}

async function processFillStyles(node: SceneNode, styles: StyleRecord) {
  if (!("fills" in node) || !node.fills || typeof node.fills === "symbol")
    return;

  const solidFill = node.fills.find(
    (fill) => fill.type === "SOLID" && fill.visible
  ) as SolidPaint;
  if (!solidFill) return;

  const color = rgbToRGBAString(solidFill.color, solidFill.opacity);
  styles[node.type === "TEXT" ? "color" : "background"] = color;

  if (!node.fills.some((fill) => fill.type === "SOLID") || isSVG(node)) {
    delete styles.background;
  }
}

function getClipPathStyle(mask: VectorNode): string {
  const clipPath = mask.vectorPaths
    .map((path) => {
      return `<path d="${path.data}" />`;
    })
    .join("");

  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${mask.width} ${mask.height}'><clipPath id='clip-path-${mask.id}'>${clipPath}</clipPath></svg>`
  )}#clip-path-${mask.id}`;
}
