// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__);
// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
informSelection();

figma.on("selectionchange", () => {
  informSelection();
});

function informSelection() {
  const nodes = figma.currentPage.selection;
  if (nodes.length === 0) {
    figma.ui.postMessage({ type: "no-selection" });
  } else {
    figma.ui.postMessage({ type: "selection", message: nodes[0].name });
  }
}

figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === "copy-data") {
    figma.notify("Copying...");
    figma.ui.postMessage({ type: "copying" });
    setTimeout(() => {
      convertToJSON().then((result) => {
        figma.ui.postMessage({
          type: "copy-to-clipboard",
          message: result,
        });
        figma.ui.postMessage({ type: "copied" });
        figma.notify("Copied to clipboard!");
      });
    }, 100);
  }
};

const BASE_STYLE_PROPERTIES = [
  "position",
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

// converts border-color to borderColor
function kebabToCamelCase(str: string) {
  return str.replace(/-([a-z])/g, function (g) {
    return g[1].toUpperCase();
  });
}

let logged = false;
async function convertToJSON() {
  logged = false;
  const pages = figma.currentPage.selection;
  const result = [];

  for (const page of pages) {
    const res = await convertPage(page);
    result.push(res);
  }
  return result;
}

async function convertPage(page: SceneNode): Promise<Block> {
  const converted = await convertNode(page);
  return converted;
}

type Block = {
  blockId: string;
  children: Block[];
  baseStyles: Record<string, string | number>;
  originalElement: string;
  rawStyles: Record<string, string | number>;
  mobileStyles: Record<string, string | number>;
  tabletStyles: Record<string, string | number>;
  attributes: Record<string, string | number>;
  classes: string[];
  innerHTML?: string;
  innerText?: string;
  dataKey: string | null;
  element: string;
  customAttributes: Record<string, string | number>;
};

async function convertNode(node: SceneNode): Promise<Block> {
  const children =
    "children" in node
      ? await Promise.all(
          node.children.filter((child) => child.visible).map(convertNode)
        )
      : [];

  const nodeStyles = await node.getCSSAsync();

  for (const key in nodeStyles) {
    nodeStyles[key] = cleanUpValue(nodeStyles[key]);
  }

  if (!logged) {
    console.log(nodeStyles);
    logged = true;
  }
  const baseStyles = await getBaseStyles(node, nodeStyles);
  const rawStyles = await getRawStyles(node, nodeStyles);

  const originalElement = isSVG(node) ? "__raw_html__" : "";
  const baseNode = {
    blockId: node.id,
    children: children,
    baseStyles: baseStyles,
    rawStyles: rawStyles,
    originalElement: originalElement,
    mobileStyles: {},
    tabletStyles: {},
    attributes: {} as Record<string, string | number>,
    classes: [],
    innerHTML: "",
    innerText: "",
    dataKey: null,
    element: getElementType(node),
    customAttributes: {},
  };

  if (node.type === "TEXT") {
    baseNode.innerText = node.characters;
  } else if (baseNode.element === "svg") {
    baseNode.innerHTML = await getSVGFromVector(node);
  } else if (baseNode.element === "img") {
    // const paint = frameNode.fills[0];
    // const image = figma.getImageByHash(paint.imageHash);
    // const bytes = await image.getBytesAsync();
    if (
      "fills" in node &&
      typeof node.fills === "object" &&
      node.fills.length > 0
    ) {
      const paint = node.fills[0];
      if (paint.type === "IMAGE" && paint.imageHash) {
        const image = figma.getImageByHash(paint.imageHash);
        if (image) {
          const bytes = await image.getBytesAsync();
          // Uint8Array to base64
          const url = `data:image/png;base64,${figma.base64Encode(bytes)}`;
          baseNode.attributes.src = url;
        }
      }
    }
  }

  return baseNode;
}

function isSVG(node: SceneNode) {
  return (
    node.type === "VECTOR" ||
    node.type === "ELLIPSE" ||
    node.type === "POLYGON" ||
    node.type === "STAR"
  );
}

function isImage(node: SceneNode) {
  return (
    node.type === "RECTANGLE" &&
    typeof node.fills === "object" &&
    node.fills.length > 0 &&
    node.fills[0].type === "IMAGE"
  );
}

async function getSVGFromVector(node: SceneNode): Promise<string> {
  // Check if the node is a vector or any node that can be converted to SVG
  if (isSVG(node)) {
    try {
      // Export the node as an SVG
      const svgData = await node.exportAsync({
        format: "SVG",
      });

      // Convert the Uint8Array to a string
      const svgString = String.fromCharCode.apply(
        null,
        svgData as unknown as number[]
      );
      return svgString as string;
    } catch (error) {
      console.error("Error exporting node to SVG:", error);
      return "";
    }
  } else {
    console.log("Selected node is not a vector or exportable as SVG.");
    return "";
  }
}

async function getBaseStyles(node: SceneNode, css: Record<string, string>) {
  const styles: Record<string, string | number> = {};

  for (const key of BASE_STYLE_PROPERTIES) {
    if (key in css) {
      styles[key] = css[key];
    }
  }

  // display none if not visible
  if ("visible" in node) {
    styles.display = node.visible ? "flex" : "none";
  }

  // strip out quotes from font-family value
  if ("font-family" in styles) {
    styles["font-family"] = (styles["font-family"] as string).replace(/"/g, "");
  }

  // overflow hidden
  if (node.type === "FRAME" || node.type === "GROUP") {
    styles.overflowX = "hidden";
    styles.overflowY = "hidden";
  }

  // set background color
  if (
    "fills" in node &&
    node.fills &&
    typeof node.fills !== "symbol" &&
    node.fills.length > 0 &&
    node.type !== "TEXT"
  ) {
    const fill = node.fills[0];
    if (fill.type === "SOLID") {
      styles.background = rgbToRGBAString(fill.color, fill.opacity);
    }
  }

  const convertedStyles = {} as Record<string, string | number>;
  // convert border-color to borderColor
  for (const key in styles) {
    convertedStyles[kebabToCamelCase(key)] = styles[key];
  }

  return convertedStyles;
}

async function getRawStyles(node: SceneNode, css: Record<string, string>) {
  const styles: Record<string, string | number> = {};

  for (const key in css) {
    if (BASE_STYLE_PROPERTIES.indexOf(key) === -1) {
      styles[key] = css[key];
    }
  }

  const convertedStyles = {} as Record<string, string | number>;
  for (const key in styles) {
    convertedStyles[kebabToCamelCase(key)] = styles[key];
  }
  return convertedStyles;
}

function getElementType(node: SceneNode) {
  if (isSVG(node)) {
    return "svg";
  } else if (isImage(node)) {
    return "img";
  }

  switch (node.type) {
    case "TEXT":
      return "p";
    case "FRAME":
    case "GROUP":
      return "section";
    case "INSTANCE":
    case "COMPONENT":
      return "div";
    case "LINE":
      return "hr";
    default:
      return "div";
  }
}

function rgbToRGBAString(color: RGB, opacity = 1) {
  if (opacity < 1) {
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(
      color.g * 255
    )}, ${Math.round(color.b * 255)}, ${opacity})`;
  } else {
    return `rgb(${Math.round(color.r * 255)}, ${Math.round(
      color.g * 255
    )}, ${Math.round(color.b * 255)})`;
  }
}

function cleanUpValue(value: string) {
  // strip out comments
  value = value.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");

  // convert color to rgba
  // const colorMatch = value.match(/color\(([^)]+)\)/) as RegExpMatchArray | null;
  // if (colorMatch) {
  //   const color = Color(colorMatch[1]);
  //   console.log(color.to("rgba").toString());
  //   value = value.replace(colorMatch[0], color.to("rgba").toString());
  // }
  return value;
}
