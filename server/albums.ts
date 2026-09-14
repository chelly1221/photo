import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Library, Photo } from "./library";

export type Album = { id: string; name: string; count: number; cover: Photo | null };

export function registerAlbumRoutes(app: FastifyInstance, lib: Library) {
  const db = lib.db;
  db.exec(`CREATE TABLE IF NOT EXISTS albums(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,createdAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS albums_owner ON albums(owner);
    CREATE TABLE IF NOT EXISTS album_photos(albumId TEXT NOT NULL,photoId TEXT NOT NULL,PRIMARY KEY(albumId,photoId));`);
  const name = z.object({ name: z.string().trim().min(1).max(80) }).strict();
  const timestamp = z.number().int().min(-62135596800000).max(253402387200000);
  const create = name.extend({ from: timestamp.optional(), to: timestamp.optional() })
    .refine(value => (value.from === undefined && value.to === undefined) ||
      (value.from !== undefined && value.to !== undefined && value.from <= value.to));
  const owner = (headers: Record<string, unknown>) => String(headers["tailscale-user-login"]).toLowerCase();
  const get = (id: string, login: string) => {
    const row = db.prepare("SELECT id,name FROM albums WHERE id=? AND owner=?").get(id, login);
    if (!row) throw Object.assign(new Error("앨범을 찾을 수 없어요."), { statusCode: 404 });
    return row;
  };
  const join = "FROM album_photos a JOIN photos p ON p.id=a.photoId JOIN sources s ON s.id=p.sourceId WHERE a.albumId=? AND s.enabled=1";
  const summary = (row: Record<string, unknown>): Album => ({
    id: String(row.id), name: String(row.name),
    count: Number(db.prepare(`SELECT count(*) count ${join}`).get(String(row.id))?.count ?? 0),
    cover: (db.prepare(`SELECT p.* ${join} ORDER BY p.takenAt DESC,p.id LIMIT 1`).get(String(row.id)) as Photo | undefined) ?? null,
  });
  const transaction = (work: () => void) => {
    db.exec("BEGIN IMMEDIATE");
    try { work(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  app.get("/api/albums", req => db.prepare("SELECT id,name FROM albums WHERE owner=? ORDER BY createdAt DESC,id").all(owner(req.headers)).map(summary));
  app.post("/api/albums", req => {
    const value = create.parse(req.body);
    const id = randomUUID();
    transaction(() => {
      db.prepare("INSERT INTO albums VALUES(?,?,?,?)").run(id, owner(req.headers), value.name, Date.now());
      if (value.from !== undefined && value.to !== undefined) {
        db.prepare(`INSERT INTO album_photos(albumId,photoId)
          SELECT ?,p.id FROM photos p JOIN sources s ON s.id=p.sourceId
          WHERE s.enabled=1 AND p.takenAt>=? AND p.takenAt<=?`).run(id, value.from, value.to);
      }
    });
    return summary({ id, name: value.name });
  });
  app.get<{ Params: { id: string } }>("/api/albums/:id", req => {
    const row = get(req.params.id, owner(req.headers));
    const q = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(200).default(100) }).parse(req.query);
    const album = summary(row);
    const items = db.prepare(`SELECT p.* ${join} ORDER BY p.takenAt DESC,p.id LIMIT ? OFFSET ?`).all(req.params.id, q.limit, q.offset);
    return { album, items, next: q.offset + items.length < album.count ? q.offset + items.length : null };
  });
  app.patch<{ Params: { id: string } }>("/api/albums/:id", req => {
    get(req.params.id, owner(req.headers));
    const value = name.parse(req.body);
    db.prepare("UPDATE albums SET name=? WHERE id=?").run(value.name, req.params.id);
    return summary({ id: req.params.id, name: value.name });
  });
  app.delete<{ Params: { id: string } }>("/api/albums/:id", req => {
    get(req.params.id, owner(req.headers));
    transaction(() => {
      db.prepare("DELETE FROM album_photos WHERE albumId=?").run(req.params.id);
      db.prepare("DELETE FROM albums WHERE id=?").run(req.params.id);
    });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/albums/:id/photos", req => {
    get(req.params.id, owner(req.headers));
    const value = z.object({ action: z.enum(["add", "remove"]), ids: z.array(z.string().min(1).max(128)).min(1).max(200) }).strict().parse(req.body);
    transaction(() => {
      for (const id of new Set(value.ids)) {
        if (value.action === "add") {
          if (!db.prepare("SELECT p.id FROM photos p JOIN sources s ON s.id=p.sourceId WHERE p.id=? AND s.enabled=1").get(id))
            throw new Error("추가할 사진을 찾을 수 없어요. 보관함을 다시 확인해 주세요.");
          db.prepare("INSERT OR IGNORE INTO album_photos VALUES(?,?)").run(req.params.id, id);
        } else db.prepare("DELETE FROM album_photos WHERE albumId=? AND photoId=?").run(req.params.id, id);
      }
    });
    return summary(get(req.params.id, owner(req.headers)));
  });
}
