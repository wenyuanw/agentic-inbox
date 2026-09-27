import { Hono } from "hono";
import type { MailboxContext } from "../lib/mailbox";
import { AIConfigError, getAIConfigView, saveAIConfig } from "../lib/ai-config";
import { safeAIError, testAIConnection } from "../lib/ai-provider";

export const aiConfigRoutes = new Hono<MailboxContext>();
// Mounted beneath requireMailbox and the app's Cloudflare Access boundary.
aiConfigRoutes.use("*", async (c, next) => {
	c.header("Cache-Control", "no-store");
	await next();
});
aiConfigRoutes.onError((error, c) =>
	c.json(
		{ error: safeAIError(error) },
		error instanceof AIConfigError || error instanceof SyntaxError ? 400 : 502,
	),
);
aiConfigRoutes.get("/", async (c) =>
	c.json(await getAIConfigView(c.env, c.req.param("mailboxId")!)),
);
aiConfigRoutes.put("/", async (c) =>
	c.json(
		await saveAIConfig(c.env, c.req.param("mailboxId")!, await c.req.json()),
	),
);
aiConfigRoutes.post("/test", async (c) =>
	c.json(
		await testAIConnection(
			c.env,
			c.req.param("mailboxId")!,
			await c.req.json(),
		),
	),
);
