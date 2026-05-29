import { config } from "./config";
import { getBase64ForHash } from "./image-cache";
import type { Block, StyleRecord } from "./types";

export async function getSVGFromVector(node: SceneNode): Promise<string> {
  try {
    const bytes = await node.exportAsync({ format: "SVG" });
    // String.fromCharCode(...spread) can exceed the call-stack for large SVGs.
    // Process the Uint8Array in 8 KB chunks to stay safe.
    let result = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      result += String.fromCharCode(
        ...(bytes.subarray(i, i + CHUNK) as unknown as number[]),
      );
    }
    return result;
  } catch (error) {
    console.error("Error exporting node to SVG:", error);
    return "";
  }
}

export async function handleImageNode(
  node: SceneNode,
  block: Block,
): Promise<void> {
  if (!("fills" in node) || !Array.isArray(node.fills)) return;

  const imageFill = node.fills.find(
    (fill): fill is ImagePaint => fill.type === "IMAGE" && fill.visible,
  );
  if (!imageFill?.imageHash) return;

  applyScaleMode(imageFill, block.baseStyles);

  if (!config.inlineImages) return;

  try {
    const url = await getBase64ForHash(imageFill.imageHash);
    if (!url) return;

    block.attributes.src = url;

    if (imageFill.rotation) {
      block.baseStyles.transform = `rotate(${imageFill.rotation}deg)`;
    }
    if (imageFill.opacity !== undefined && imageFill.opacity !== 1) {
      block.baseStyles.opacity = imageFill.opacity;
    }
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

export async function setBackgroundImage(
  node: SceneNode,
  block: Block,
): Promise<void> {
  if (!("fills" in node) || !Array.isArray(node.fills)) return;

  const imageFill = node.fills.find(
    (fill) => fill.type === "IMAGE" && fill.visible,
  ) as ImagePaint | undefined;
  if (!imageFill?.imageHash) return;

  const url = await getBase64ForHash(imageFill.imageHash);
  if (!url) return;

  const bgSize =
    imageFill.scaleMode === "FILL"
      ? "cover"
      : imageFill.scaleMode === "FIT"
        ? "contain"
        : "auto";

  block.baseStyles.background = `url(${url}) center center / ${bgSize} no-repeat`;
}

export function getClipPathStyle(mask: VectorNode): string {
  const paths = mask.vectorPaths.map((p) => `<path d="${p.data}" />`).join("");

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${mask.width} ${mask.height}'>` +
    `<clipPath id='clip-path-${mask.id}'>${paths}</clipPath></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#clip-path-${mask.id}")`;
}

function applyScaleMode(fill: ImagePaint, styles: StyleRecord): void {
  if (fill.scaleMode === "FILL") styles.objectFit = "cover";
  else if (fill.scaleMode === "FIT") styles.objectFit = "contain";
}
