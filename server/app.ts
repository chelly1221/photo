import Fastify from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import type { Library } from "./library";
import { Backups } from "./backup";
export function createApp(lib: Library, allowedLogins: string[]) {
  if (!allowedLogins.length) throw new Error("Explicit Tailscale account allowlist required");
  const allowed = new Set(allowedLogins.map((x) => x.toLowerCase()));
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 ** 2, requestTimeout: 60000 });
  const backups = new Backups(lib);
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) =>
    done(null, body),
  );
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff");
    if (req.method === "GET" && req.url === "/api/health") return;
    if (req.headers.origin && req.headers.origin !== "https://audax-vm.tail62313c.ts.net:8446")
      return reply.code(403).send({ error: "허용되지 않은 연결이에요." });
    const login = req.headers["tailscale-user-login"];
    if (typeof login !== "string" || !allowed.has(login.toLowerCase()))
      return reply.code(403).send({ error: "Tailscale 계정을 확인해 주세요." });
  });
  app.setErrorHandler((error, _req, reply) => {
    const status = error instanceof z.ZodError ? 400 : Number((error as any).statusCode ?? 400);
    reply
      .code(status >= 400 && status < 600 ? status : 500)
      .send({
        error:
          error instanceof z.ZodError
            ? "입력 내용을 확인해 주세요."
            : error instanceof Error && !("code" in error)
              ? error.message
              : "서버 연결과 폴더 권한을 확인해 주세요.",
      });
  });
  app.get("/api/health", () => ({ ok: true }));
  app.get("/api/identity", (req) => ({ login: req.headers["tailscale-user-login"] }));
  app.get("/api/status", () => lib.stats());
  app.get("/api/sources", () => lib.sources());
  app.post("/api/sources", (req) =>
    lib.addSource(
      z
        .object({
          name: z.string().trim().min(1).max(80),
          share: z.string().trim().min(1).max(128),
          folder: z.string().max(500).default(""),
          backup: z.boolean().default(false),
        })
        .strict()
        .parse(req.body),
    ),
  );
  app.put<{ Params: { id: string } }>("/api/sources/:id", (req) => {
    const s = lib.source(req.params.id);
    const v = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    lib.db.prepare("UPDATE sources SET enabled=? WHERE id=?").run(v.enabled ? 1 : 0, s.id);
    return lib.source(s.id);
  });
  app.post("/api/scan", (_req, reply) => {
    void lib.startScan(true);
    return reply.code(202).send({ scanning: true });
  });
  app.get("/api/photos", (req) => {
    const q = z
      .object({
        q: z.string().max(200).optional(),
        source: z.string().uuid().optional(),
        folder: z.string().max(500).optional(),
        favorite: z.enum(["true", "false"]).optional(),
        from: z.coerce.number().optional(),
        to: z.coerce.number().optional(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        sort: z.enum(["newest", "oldest"]).optional(),
      })
      .parse(req.query);
    return lib.list({ ...q, favorite: q.favorite === "true" });
  });
  app.get("/api/folders", () => lib.folders());
  app.get("/api/map", () => lib.map());
  app.get<{ Params: { id: string } }>("/api/photos/:id", (req) => lib.get(req.params.id));
  app.put<{ Params: { id: string } }>("/api/photos/:id/favorite", (req) =>
    lib.favorite(
      req.params.id,
      z.object({ favorite: z.boolean() }).strict().parse(req.body).favorite,
    ),
  );
  app.get<{ Params: { id: string; size: string } }>("/api/media/:id/:size", async (req, reply) => {
    const size = z.enum(["thumb", "preview", "original"]).parse(req.params.size);
    if (size === "original") {
      const { file, photo } = await lib.photoFile(req.params.id);
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .parse((req.query as any).offset);
      if (offset >= photo.size)
        return reply.code(416).send({ error: "파일 범위를 확인해 주세요." });
      const length = Math.min(2 * 1024 ** 2, photo.size - offset);
      const handle = await fs.open(file, "r");
      try {
        const data = Buffer.alloc(length);
        const result = await handle.read(data, 0, length, offset);
        return reply.type("application/octet-stream").send(data.subarray(0, result.bytesRead));
      } finally {
        await handle.close();
      }
    }
    return reply.type("image/webp").send(createReadStream(await lib.thumb(req.params.id, size)));
  });
  app.post("/api/backups", (req) =>
    backups.begin(
      z
        .object({
          sourceId: z.string().uuid(),
          name: z.string().min(1).max(255),
          bytes: z
            .number()
            .int()
            .positive()
            .max(250 * 1024 ** 2),
          digest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body),
    ),
  );
  app.put<{ Params: { id: string } }>("/api/backups/:id", (req) =>
    backups.chunk(
      z.string().uuid().parse(req.params.id),
      z.coerce
        .number()
        .int()
        .min(0)
        .parse((req.query as any).offset),
      req.body as Buffer,
    ),
  );
  app.post<{ Params: { id: string } }>("/api/backups/:id/complete", (req) =>
    backups.finish(z.string().uuid().parse(req.params.id)),
  );
  app.get("/api/sync/events", (_req, reply) => {
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    reply.raw.write(": connected\n\n");
    const timer = setInterval(() => reply.raw.write("event: change\ndata: {}\n\n"), 15000);
    reply.raw.on("close", () => clearInterval(timer));
    reply.hijack();
  });
  return app;
}
