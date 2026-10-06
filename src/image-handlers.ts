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
  const imageFill = findImageFill(node);
  if (!imageFill?.imageHash) return;

  applyScaleMode(imageFill, block.baseStyles);
  applyCrop(imageFill, block.baseStyles);
  applyImageFilters(imageFill, block.baseStyles);

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
  const imageFill = findImageFill(node);
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

function findImageFill(node: SceneNode): ImagePaint | undefined {
  if (!("fills" in node) || !Array.isArray(node.fills)) return undefined;

  return node.fills.find(
    (fill): fill is ImagePaint => fill.type === "IMAGE" && fill.visible !== false,
  );
}

// Cropping in Figma keeps a slice of the source image, and the transform gives
// that slice in the image's own 0–1 space — which is what object-view-box takes,
// so the zoom and framing stay editable in Builder.
function applyCrop(fill: ImagePaint, styles: StyleRecord): void {
  if (fill.scaleMode !== "CROP" || !fill.imageTransform) return;

  const [[width, skewX, left], [skewY, height, top]] = fill.imageTransform;
  // a rotated crop needs a transform, which object-view-box can't carry
  if (skewX || skewY || !width || !height) return;

  const sides = [top, 1 - left - width, 1 - top - height, left];
  styles.objectViewBox = `inset(${sides.map(toPercent).join(" ")})`;
  styles.objectFit = "cover";
}

function toPercent(fraction: number): string {
  return `${Math.round(Math.max(0, fraction) * 1000) / 10}%`;
}

// Figma's sliders run from -1 to 1, with 0 leaving the image alone. Saturation
// lands exactly on CSS saturate(); brightness and contrast come close. Figma's
// temperature, tint, highlights and shadows have no CSS filter to map onto.
function applyImageFilters(fill: ImagePaint, styles: StyleRecord): void {
  const { saturation = 0, exposure = 0, contrast = 0 } = fill.filters ?? {};
  const filters: string[] = [];

  if (saturation) filters.push(`saturate(${round(1 + saturation)})`);
  if (exposure) filters.push(`brightness(${round(1 + exposure)})`);
  if (contrast) filters.push(`contrast(${round(1 + contrast)})`);

  if (filters.length) styles.filter = filters.join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
