export type PluginConfig = {
  /** Keep Figma Variables as CSS var(...) so they map to Builder Variables. */
  stripVariables: boolean;
  /** Map text nodes to h1–h6 by name or font size instead of always <p>. */
  semanticHeadings: boolean;
  /** Inline raster images as base64 data URLs (vs. leaving the element empty). */
  inlineImages: boolean;
};

export type MessageTypes =
  | { type: "no-selection" }
  | { type: "selection"; message: string }
  | { type: "copying" }
  | { type: "copied" }
  | { type: "copy-data"; config?: Partial<PluginConfig> }
  | { type: "copy-to-clipboard"; message: Block[] }
  | { type: "resize"; height: number };

export type StyleRecord = Record<string, string | number>;

export type Block = {
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
