export const AI_PROVIDERS = [
	"workers-ai",
	"openai",
	"anthropic",
	"google",
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export interface AIConfigInput {
	provider: AIProvider;
	model: string;
	baseURL: string;
	/** Empty or omitted preserves the key only for the same provider and URL. */
	apiKey?: string;
}

export interface AIConfigView {
	provider: AIProvider;
	model: string;
	baseURL: string;
	hasApiKey: boolean;
	encryptionReady: boolean;
}

export const DEFAULT_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
export const DEFAULT_AI_BASE_URLS: Record<AIProvider, string> = {
	"workers-ai": "",
	openai: "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
	google: "https://generativelanguage.googleapis.com/v1beta",
};
