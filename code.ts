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

figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type === "copy-data") {
    await convertToJSON();
  }
};

async function convertToJSON() {
  const pages = figma.currentPage.selection;
  const result = [];

  for (const page of pages) {
    const res = await convertPage(page);
    result.push(res);
  }
  figma.ui.postMessage({
    type: "copy-to-clipboard",
    message: result,
  });
  figma.notify("Copied to clipboard");
}

async function convertPage(page: SceneNode): Promise<Block> {
  return convertNode(page);
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
  // const css = await node.getCSSAsync();
  // console.log(css);
  const children =
    "children" in node ? await Promise.all(node.children.map(convertNode)) : [];
  const originalElement = isSVG(node) ? "__raw_html__" : "";
  const baseNode = {
    blockId: node.id,
    children: children,
    baseStyles: getBaseStyles(node),
    rawStyles: getRawStyles(node),
    originalElement: originalElement,
    mobileStyles: {},
    tabletStyles: {},
    attributes: {},
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
  }
  return baseNode;
}

function isSVG(node: SceneNode) {
  return (
    node.type === "VECTOR" ||
    node.type === "ELLIPSE" ||
    node.type === "POLYGON" ||
    node.type === "STAR" ||
    node.type === "RECTANGLE"
  );
}

async function getSVGFromVector(node: SceneNode): Promise<string> {
  // Check if the node is a vector or any node that can be converted to SVG
  if (
    node.type === "VECTOR" ||
    node.type === "ELLIPSE" ||
    node.type === "POLYGON" ||
    node.type === "STAR" ||
    node.type === "RECTANGLE"
  ) {
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

function getBaseStyles(node: SceneNode) {
  const styles: Record<string, string | number> = {};

  if (isSVG(node)) {
    return styles;
  }

  // if auto layout is disabled then set position to relative
  // if ("layoutMode" in node && node.layoutMode === "NONE") {
  //   styles.position = "relative";
  // }

  // if text
  if (node.type === "TEXT") {
    if (node.textDecoration === "STRIKETHROUGH") {
      styles.textDecoration = "line-through";
    }
    if (node.textAlignHorizontal === "CENTER") {
      styles.textAlign = "center";
    }
    if (node.textAlignHorizontal === "RIGHT") {
      styles.textAlign = "right";
    }
    if (node.textAlignHorizontal === "JUSTIFIED") {
      styles.textAlign = "justify";
    }
    if (node.textAlignVertical === "CENTER") {
      styles.alignItems = "center";
    }
    if (node.textAlignVertical === "BOTTOM") {
      styles.alignItems = "flex-end";
    }
    if (node.textAlignVertical === "TOP") {
      styles.alignItems = "flex-start";
    }
    if (node.paragraphIndent) {
      styles.textIndent = `${node.paragraphIndent}px`;
    }
    if (node.paragraphSpacing) {
      styles.lineHeight = `${node.paragraphSpacing}px`;
    }
    if (node.fontSize && typeof node.fontSize !== "symbol") {
      styles.fontSize = `${node.fontSize}px`;
    }
    if (node.fontName && typeof node.fontName !== "symbol") {
      styles.fontFamily = node.fontName.family;
    }
    if (node.letterSpacing && typeof node.letterSpacing !== "symbol") {
      if (typeof node.letterSpacing === "object") {
        if (node.letterSpacing.unit === "PIXELS") {
          styles.letterSpacing = `${node.letterSpacing.value}px`;
        } else if (node.letterSpacing.unit === "PERCENT") {
          styles.letterSpacing = `${node.letterSpacing.value}%`;
        }
      } else {
        styles.letterSpacing = `${node.letterSpacing}px`;
      }
    }
    if (node.lineHeight && typeof node.lineHeight !== "symbol") {
      // if node.lineHeight is object
      if (typeof node.lineHeight === "object") {
        if (node.lineHeight.unit === "PIXELS") {
          styles.lineHeight = `${node.lineHeight.value}px`;
        } else if (node.lineHeight.unit === "PERCENT") {
          styles.lineHeight = `${node.lineHeight.value}%`;
        }
      } else {
        styles.lineHeight = `${node.lineHeight}px`;
      }
    }
    if (node.textCase === "UPPER") {
      styles.textTransform = "uppercase";
    }
    if (node.textCase === "LOWER") {
      styles.textTransform = "lowercase";
    }
    if (node.textCase === "TITLE") {
      styles.textTransform = "capitalize";
    }
    if (node.textDecoration === "UNDERLINE") {
      styles.textDecoration = "underline";
    }
  }

  if ("visible" in node) {
    styles.display = node.visible ? "flex" : "none";
  }

  if ("layoutMode" in node) {
    styles.flexDirection = node.layoutMode === "HORIZONTAL" ? "row" : "column";
  }

  // if auto layout is disabled then set position to absolute and top left
  // if (
  //   ("layoutMode" in node && node.layoutMode === "NONE") ||
  //   !node.layoutMode
  // ) {
  //   styles.position = "absolute";
  //   styles.top = `${node.y}px`;
  //   styles.left = `${node.x}px`;
  // }

  // gap
  if ("itemSpacing" in node) {
    styles.gap = `${node.itemSpacing}px`;
  }

  if ("primaryAxisAlignItems" in node) {
    switch (node.primaryAxisAlignItems) {
      case "MIN":
        styles.justifyContent = "flex-start";
        break;
      case "CENTER":
        styles.justifyContent = "center";
        break;
      case "MAX":
        styles.justifyContent = "flex-end";
        break;
      case "SPACE_BETWEEN":
        styles.justifyContent = "space-between";
        break;
    }
  }

  if ("counterAxisAlignItems" in node) {
    switch (node.counterAxisAlignItems) {
      case "MIN":
        styles.alignItems = "flex-start";
        break;
      case "CENTER":
        styles.alignItems = "center";
        break;
      case "MAX":
        styles.alignItems = "flex-end";
        break;
    }
  }

  if (node.type !== "TEXT") {
    if (
      "layoutMode" in node &&
      node.layoutMode === "HORIZONTAL" &&
      "primaryAxisSizingMode" in node &&
      node.primaryAxisSizingMode === "FIXED"
    ) {
      styles.width = `${node.width}px`;
    }
    if (
      "layoutMode" in node &&
      node.layoutMode === "VERTICAL" &&
      "primaryAxisSizingMode" in node &&
      node.primaryAxisSizingMode === "FIXED"
    ) {
      styles.height = `${node.height}px`;
    }
    // if ("height" in node) {
    //   styles.height = `${Math.round(node.height)}px`;
    // }
    // if ("width" in node) {
    //   styles.width = `${Math.round(node.width)}px`;
    // }
  }

  if ("cornerRadius" in node) {
    if (typeof node.cornerRadius !== "symbol") {
      styles.borderRadius = `${node.cornerRadius}px`;
    }
  }

  if ("strokes" in node && node.strokes.length > 0) {
    const stroke = node.strokes[0];
    if (stroke.type === "SOLID") {
      styles.borderColor = rgbToRGBAString(stroke.color);
      if ("strokeWeight" in node) {
        if (typeof node.strokeWeight !== "symbol") {
          if (node.type === "TEXT") {
            // styles.textStrokeWidth = `${node.strokeWeight}px`;
          } else {
            styles.borderWidth = `${node.strokeWeight}px`;
          }
        }
      }
    }
  }

  if (
    "fills" in node &&
    node.fills &&
    typeof node.fills !== "symbol" &&
    node.fills.length > 0
  ) {
    if (node.type === "TEXT") {
      const fill = node.fills[0];
      if (fill.type === "SOLID") {
        styles.color = rgbToRGBAString(fill.color, fill.opacity);
      }
    } else {
      const fill = node.fills[0];
      if (fill.type === "SOLID") {
        styles.background = rgbToRGBAString(fill.color, fill.opacity);
      }
    }
  }

  // padding
  if ("paddingLeft" in node) {
    styles.paddingLeft = `${node.paddingLeft}px`;
  }
  if ("paddingRight" in node) {
    styles.paddingRight = `${node.paddingRight}px`;
  }
  if ("paddingTop" in node) {
    styles.paddingTop = `${node.paddingTop}px`;
  }
  if ("paddingBottom" in node) {
    styles.paddingBottom = `${node.paddingBottom}px`;
  }

  return styles;
}

function getRawStyles(node: SceneNode) {
  const styles: Record<string, string | number> = {};

  // if vector
  if (isSVG(node)) {
    return styles;
  }

  // if ("rotation" in node) {
  //   styles.transform = `rotate(${node.rotation}deg)`;

  //   if ("layoutMode" in node && node.layoutMode === "HORIZONTAL") {
  //     styles.transform = `rotate(${node.rotation}deg)`;
  //   }
  // }

  if ("opacity" in node && node.opacity !== 1) {
    styles.opacity = node.opacity;
  }

  // if (
  //   "blendMode" in node &&
  //   (node.blendMode === "PASS_THROUGH" || node.blendMode === "NORMAL")
  // ) {
  //   styles.mixBlendMode = node.blendMode.toLowerCase();
  // }

  if ("effects" in node && node.effects.length > 0) {
    const effect = node.effects[0];
    if (effect.type === "DROP_SHADOW") {
      styles.boxShadow = `${effect.offset.x}px ${effect.offset.y}px ${
        effect.radius
      }px ${rgbToRGBAString(effect.color)}`;
    }
  }

  // if ("strokeAlign" in node) {
  //   styles.borderStyle = node.strokeAlign;
  // }

  return styles;
}

function getElementType(node: SceneNode) {
  switch (node.type) {
    case "TEXT":
      return "p";
    case "FRAME":
    case "GROUP":
      return "section";
    case "INSTANCE":
    case "COMPONENT":
      return "div";
    case "VECTOR":
    case "RECTANGLE":
    case "ELLIPSE":
    case "POLYGON":
      return "svg";
    case "LINE":
      return "hr";
    default:
      return "div";
  }
}

// function rgbToHex(color: RGB) {
//   console.log(color);

//   const r = Math.round(color.r * 255)
//     .toString(16)
//     .padStart(2, "0");
//   const g = Math.round(color.g * 255)
//     .toString(16)
//     .padStart(2, "0");
//   const b = Math.round(color.b * 255)
//     .toString(16)
//     .padStart(2, "0");
//   return `#${r}${g}${b}`;
// }

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
