import type { Env } from "../workers/types";

export function fixture() {
	const objects = new Map<string, string>();
	const env = {
		AI: { run: async () => ({ response: "NO" }) },
		AI_CONFIG_ENCRYPTION_KEY: btoa("a".repeat(32)),
		BUCKET: {
			get: async (key: string) =>
				objects.has(key)
					? { json: async () => JSON.parse(objects.get(key)!) }
					: null,
			put: async (key: string, value: string) => {
				objects.set(key, value);
			},
			delete: async (key: string) => {
				objects.delete(key);
			},
		},
	} as unknown as Env;
	return { env, objects };
}
