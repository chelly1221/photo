import Fastify from "fastify";
import { registerPublicWeb } from "./public-web";
const app = Fastify({ logger: false });
await registerPublicWeb(app, {
  webRoot: process.env.WEB_ROOT ?? "dist",
  downloadsRoot: process.env.DOWNLOADS_ROOT,
});
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8794) });
