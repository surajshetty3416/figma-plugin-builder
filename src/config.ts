import type { PluginConfig } from "./types";

/**
 * Runtime config — defaults reflect Builder's preferred behaviour.
 * Overridden by the UI before each copy via `updateConfig`.
 */
export const config: PluginConfig = {
  stripVariables: false,
  semanticHeadings: true,
  inlineImages: true,
};

export function updateConfig(patch: Partial<PluginConfig>): void {
  Object.assign(config, patch);
}
