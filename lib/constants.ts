export const DEFAULT_MODEL = "moonshotai/kimi-k2-thinking";
export const SUPPORTED_MODELS = [
  "moonshotai/kimi-k2-thinking",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

export const MODEL_DISPLAY_NAMES: Record<SupportedModel, string> = {
  "moonshotai/kimi-k2-thinking": "Kimi K2 Thinking",
};

export const MODEL_LOGOS: Record<SupportedModel, string> = {
  "moonshotai/kimi-k2-thinking": "/kimi.png",
};
