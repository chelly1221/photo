import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import exifr from "exifr";
import sharp from "sharp";
import { supportsMedia, isVideo } from "../src/lib/media-formats";
import { createDerivatives } from "./media-processing";

const exec = promisify(execFile);
export type Source = {
  id: string;
  name: string;
  share: string;
  folder: string;
  backup: boolean;
  enabled: number;
  error: string | null;
  scannedAt: number | null;
  host?: string | null;
  protocol?: string | null;
  connectionId?: string | null;
};
export type Photo = {
  id: string;
  sourceId: string;
  relativePath: string;
  name: string;
  folder: string;
  size: number;
  mtime: number;
  takenAt: number;
  width: number;
  height: number;
  latitude: number | null;
  longitude: number | null;
  camera: string | null;
  favorite: number;
  version: string;
  error: string | null;
};
export function safeRelative(value: string) {
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((s) => s === ".." || s === ".") ||
    /^[a-z]:/i.test(value)
  )
    throw new Error("폴더 경로를 확인해 주세요.");
  return value.replace(/^\/+|\/+$/g, "");
}
export class Library {
  db: DatabaseSync;
  scanning = false;
  progress = { processed: 0, found: 0, errors: 0, startedAt: 0, finishedAt: 0 };
  stopped = false;
  private work: Promise<void> | null = null;
  private deleting = false;
  constructor(
    public config: {
      stateDir: string;
      mountRoot: string;
      mountHelper?: string;
      testRoots?: Record<string, string>;
    },
  ) {
    this.db = new DatabaseSync(path.join(config.stateDir, "index.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,share TEXT NOT NULL,folder TEXT NOT NULL,backup INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,error TEXT,scannedAt INTEGER);
      CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,sourceId TEXT NOT NULL,relativePath TEXT NOT NULL,name TEXT NOT NULL,folder TEXT NOT NULL,size INTEGER NOT NULL,mtime REAL NOT NULL,takenAt REAL NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,latitude REAL,longitude REAL,camera TEXT,favorite INTEGER NOT NULL DEFAULT 0,version TEXT NOT NULL,error TEXT,seen TEXT);
      CREATE INDEX IF NOT EXISTS photos_date ON photos(takenAt DESC,id);
      CREATE INDEX IF NOT EXISTS photos_source ON photos(sourceId,folder);
      CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,sourceId TEXT NOT NULL,name TEXT NOT NULL,bytes INTEGER NOT NULL,offset INTEGER NOT NULL DEFAULT 0,digest TEXT NOT NULL,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS backups(digest TEXT NOT NULL,sourceId TEXT NOT NULL,relativePath TEXT NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(digest,sourceId));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    if (
      !this.db
        .prepare("PRAGMA table_info(backups)")
        .all()
        .some((row) => row.name === "sourceId" && Number(row.pk) > 0)
    ) {
      this.db.exec(
        "BEGIN; ALTER TABLE backups RENAME TO backups_legacy; CREATE TABLE backups(digest TEXT NOT NULL,sourceId TEXT NOT NULL,relativePath TEXT NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(digest,sourceId)); INSERT INTO backups SELECT * FROM backups_legacy; DROP TABLE backups_legacy; COMMIT;",
      );
    }
    for (const column of ["host", "protocol", "connectionId"]) {
      if (
        !this.db
          .prepare("PRAGMA table_info(sources)")
          .all()
          .some((row) => row.name === column)
      )
        this.db.exec(`ALTER TABLE sources ADD COLUMN ${column} TEXT`);
    }
    sharp.concurrency(1);
    sharp.cache({ memory: 64, files: 0, items: 50 });
  }
  sources() {
    return this.db.prepare("SELECT * FROM sources ORDER BY name").all() as unknown as Source[];
  }
  source(id: string) {
    const s = this.sources().find((x) => x.id === id);
    if (!s) throw Object.assign(new Error("공유 폴더를 찾을 수 없어요."), { statusCode: 404 });
    return s;
  }
  async addSource(input: { name: string; share: string; folder: string; backup: boolean }) {
    if (
      !input.share.trim() ||
      input.share.length > 128 ||
      /[\\/\r\n\0]/.test(input.share) ||
      input.share.startsWith("-")
    )
      throw new Error("공유 이름을 확인해 주세요.");
    const folder = safeRelative(input.folder);
    const id = randomUUID();
    if (this.sources().some((s) => s.share === input.share && s.folder === folder))
      throw new Error("이미 연결된 폴더예요.");
    if (!this.config.testRoots && !this.config.mountHelper)
      throw new Error("서버의 NAS 연결 도우미 설정을 확인해 주세요.");
    if (this.config.mountHelper)
      await exec(
        "sudo",
        ["-n", this.config.mountHelper, id, input.share, input.backup ? "rw" : "ro"],
        { timeout: 30000 },
      );
    const root = this.config.testRoots?.[input.share] ?? path.join(this.config.mountRoot, id);
    const target = path.join(root, folder);
    await this.assertInside(root, target);
    await fs.access(target);
    this.db
      .prepare("INSERT INTO sources(id,name,share,folder,backup) VALUES(?,?,?,?,?)")
      .run(id, input.name, input.share, folder, input.backup ? 1 : 0);
    this.startScan();
    return this.source(id);
  }
  async assertInside(root: string, target: string) {
    const realRoot = await fs.realpath(root);
    const realTarget = await fs.realpath(target);
    const relative = path.relative(realRoot, realTarget);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
      throw Object.assign(new Error("폴더 범위를 벗어났어요."), { statusCode: 403 });
    return realTarget;
  }
  async addNasSource(
    input: { name: string; connectionId: string; path: string; backup: boolean },
    mount: (id: string) => Promise<{ host: string; protocol: string; path: string }>,
  ) {
    safeRelative(input.path);
    if (this.sources().some((s) => s.connectionId === input.connectionId && s.share === input.path))
      throw new Error("이미 연결된 폴더예요.");
    const id = randomUUID();
    const remote = await mount(id);
    const base = path.join(this.config.mountRoot, id);
    await this.assertInside(base, base);
    this.db
      .prepare(
        "INSERT INTO sources(id,name,share,folder,backup,host,protocol,connectionId) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        input.name,
        remote.path,
        "",
        input.backup ? 1 : 0,
        remote.host,
        remote.protocol,
        input.connectionId,
      );
    void this.startScan();
    return this.source(id);
  }
  async root(source: Source) {
    const base =
      this.config.testRoots?.[source.share] ?? path.join(this.config.mountRoot, source.id);
    if (!this.config.testRoots) {
      const { stdout } = await exec("findmnt", ["-rn", "-M", base, "-o", "FSTYPE,SOURCE"], {
        timeout: 5000,
      });
      const valid = source.protocol
        ? stdout.trim() === `fuse.rclone photo-${source.id}`
        : stdout.trim().startsWith("cifs ") && stdout.includes("//100.75.89.101/");
      if (!valid) throw new Error("NAS가 연결되지 않았어요.");
    }
    return this.assertInside(base, path.join(base, source.folder));
  }
  async photoFile(id: string) {
    const photo = this.get(id);
    const root = await this.root(this.source(photo.sourceId));
    return { photo, file: await this.assertInside(root, path.join(root, photo.relativePath)) };
  }
  get(id: string) {
    const item = this.db.prepare("SELECT * FROM photos WHERE id=?").get(id) as unknown as
      | Photo
      | undefined;
    if (!item) throw Object.assign(new Error("사진을 찾을 수 없어요."), { statusCode: 404 });
    return item;
  }
  async deletePhoto(id: string, version: string, removeRemote?: (source: Source, photo: Photo) => Promise<unknown>) {
    if (this.deleting) throw Object.assign(new Error("다른 사진을 삭제하고 있어요. 잠시 후 다시 시도해 주세요."), { statusCode: 409 });
    this.deleting = true;
    try {
      await this.work;
      const photo = this.get(id);
      const source = this.source(photo.sourceId);
      if (!source.enabled) throw Object.assign(new Error("연결이 중지된 폴더예요."), { statusCode: 409 });
      if (photo.version !== version) throw Object.assign(new Error("사진이 변경됐어요. 다시 확인한 뒤 삭제해 주세요."), { statusCode: 409 });
      const relative = safeRelative(photo.relativePath);
      if (!relative) throw new Error("삭제할 파일을 확인해 주세요.");
      const root = await this.root(source);
      let file = root;
      for (const part of relative.split("/")) {
        file = path.join(file, part);
        if ((await fs.lstat(file)).isSymbolicLink()) throw Object.assign(new Error("연결된 파일은 삭제할 수 없어요."), { statusCode: 403 });
      }
      await this.assertInside(root, file);
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size !== photo.size || stat.mtimeMs !== photo.mtime)
        throw Object.assign(new Error("원본이 변경됐어요. 다시 확인한 뒤 삭제해 주세요."), { statusCode: 409 });
      if (this.config.testRoots) await fs.unlink(file);
      else if (source.connectionId && removeRemote) await removeRemote(source, photo);
      else throw Object.assign(new Error("이 연결 방식은 원본 삭제를 지원하지 않아요. 설정에서 NAS 폴더를 다시 연결해 주세요."), { statusCode: 403 });
      this.db.exec("BEGIN");
      try {
        if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='album_photos'").get())
          this.db.prepare("DELETE FROM album_photos WHERE photoId=?").run(photo.id);
        this.db.prepare("DELETE FROM photos WHERE id=?").run(photo.id);
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      for (const kind of ["thumb", "preview", "video"])
        await fs.unlink(path.join(this.config.stateDir, "thumbs", `${id}-${version}-${kind}.${kind === "video" ? "mp4" : "webp"}`)).catch(() => {});
      return { deleted: photo.id };
    } finally { this.deleting = false; }
  }
  private photoFilter(query: {
    q?: string;
    source?: string;
    folder?: string;
    favorite?: boolean;
    from?: number;
    to?: number;
    sort?: string;
  }) {
    const clauses = ["s.enabled=1"];
    const params: (string | number)[] = [];
    if (query.q) {
      clauses.push(
        "(p.name LIKE ? ESCAPE '\\' OR p.folder LIKE ? ESCAPE '\\' OR p.camera LIKE ? ESCAPE '\\')",
      );
      const term = "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%";
      params.push(term, term, term);
    }
    if (query.source) {
      clauses.push("p.sourceId=?");
      params.push(query.source);
    }
    if (query.folder !== undefined) {
      clauses.push("p.folder=?");
      params.push(query.folder);
    }
    if (query.favorite) clauses.push("p.favorite=1");
    if (query.from !== undefined) {
      clauses.push("p.takenAt>=?");
      params.push(query.from);
    }
    if (query.to !== undefined) {
      clauses.push("p.takenAt<=?");
      params.push(query.to);
    }
    const where = clauses.join(" AND ");
    const join = "FROM photos p JOIN sources s ON s.id=p.sourceId";
    return { where, join, params };
  }
  list(query: {
    q?: string; source?: string; folder?: string; favorite?: boolean;
    from?: number; to?: number; sort?: string; offset: number; limit: number;
  }) {
    const { where, join, params } = this.photoFilter(query);
    const total = Number(
      this.db.prepare(`SELECT count(*) count ${join} WHERE ${where}`).get(...params)?.count ?? 0,
    );
    const items = this.db
      .prepare(
        `SELECT p.* ${join} WHERE ${where} ORDER BY p.takenAt ${query.sort === "oldest" ? "ASC" : "DESC"},p.id LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset);
    return {
      items,
      total,
      next: query.offset + items.length < total ? query.offset + items.length : null,
    };
  }
  timeline(query: {
    q?: string; source?: string; folder?: string; favorite?: boolean;
    from?: number; to?: number; sort?: string; timezoneOffset: number;
  }) {
    const { where, join, params } = this.photoFilter(query);
    const rows = this.db.prepare(
      `SELECT strftime('%Y-%m', p.takenAt / 1000.0, 'unixepoch', ?) month,
       count(*) count ${join} WHERE ${where} GROUP BY month
       ORDER BY month ${query.sort === "oldest" ? "ASC" : "DESC"}`,
    ).all(`${query.timezoneOffset} minutes`, ...params);
    let offset = 0;
    return rows.map((row) => {
      const bucket = { month: String(row.month), count: Number(row.count), offset };
      offset += bucket.count;
      return bucket;
    });
  }
  folders() {
    return this.db
      .prepare(
        "SELECT p.sourceId,p.folder,count(*) count FROM photos p JOIN sources s ON s.id=p.sourceId WHERE s.enabled=1 GROUP BY p.sourceId,p.folder ORDER BY p.folder",
      )
      .all();
  }
  map() {
    return this.db
      .prepare(
        "SELECT p.id,p.name,p.latitude,p.longitude,p.takenAt,p.version FROM photos p JOIN sources s ON s.id=p.sourceId WHERE s.enabled=1 AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 100000",
      )
      .all();
  }
  stats() {
    return {
      sources: this.sources(),
      scanning: this.scanning,
      progress: this.progress,
      ...this.db
        .prepare(
          "SELECT count(*) total,sum(favorite) favorites,sum(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) located,sum(size) bytes FROM photos p JOIN sources s ON s.id=p.sourceId WHERE s.enabled=1",
        )
        .get(),
    };
  }
  favorite(id: string, value: boolean) {
    this.get(id);
    this.db.prepare("UPDATE photos SET favorite=? WHERE id=?").run(value ? 1 : 0, id);
    return this.get(id);
  }
  async thumb(id: string, size: "thumb" | "preview") {
    const photo = this.get(id);
    const file = path.join(
      this.config.stateDir,
      "thumbs",
      `${photo.id}-${photo.version}-${size}.webp`,
    );
    await fs.access(file).catch(() => { throw Object.assign(new Error(photo.error || "미리보기를 준비하고 있어요."), { statusCode: 422 }); });
    return file;
  }
  async video(id: string) {
    const photo = this.get(id);
    if (!isVideo(photo.name)) throw Object.assign(new Error("동영상이 아니에요."), { statusCode: 404 });
    const file = path.join(this.config.stateDir, "thumbs", `${photo.id}-${photo.version}-video.mp4`);
    const stat = await fs.stat(file).catch(() => { throw Object.assign(new Error(photo.error || "재생용 영상을 준비하고 있어요. 잠시 후 다시 열어 주세요."), { statusCode: 422 }); });
    return { file, size: stat.size };
  }
  startScan(retryErrors = false) {
    if (this.deleting) return this.work ?? Promise.resolve();
    if (this.work) return this.work;
    this.work = this.scan(retryErrors).finally(() => {
      this.work = null;
    });
    return this.work;
  }
  async scan(retryErrors = false) {
    this.scanning = true;
    this.progress = { processed: 0, found: 0, errors: 0, startedAt: Date.now(), finishedAt: 0 };
    try {
      await fs.mkdir(path.join(this.config.stateDir, "thumbs"), { recursive: true });
      for (const source of this.sources().filter((s) => s.enabled)) {
        if (this.stopped) break;
        const scanId = randomUUID();
        let complete = true;
        try {
          const root = await this.root(source);
          const walk = async (dir: string): Promise<void> => {
            let entries;
            try {
              entries = await fs.readdir(dir, { withFileTypes: true });
            } catch {
              complete = false;
              this.progress.errors++;
              return;
            }
            for (const entry of entries) {
              if (this.stopped) {
                complete = false;
                return;
              }
              if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
              const file = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await walk(file);
                continue;
              }
              if (!entry.isFile() || !supportsMedia(entry.name)) continue;
              this.progress.found++;
              try {
                await this.assertInside(root, file);
                const stat = await fs.stat(file);
                const relativePath = path.relative(root, file).split(path.sep).join("/");
                const id = createHash("sha256")
                  .update(source.id + "\0" + relativePath)
                  .digest("hex")
                  .slice(0, 32);
                const version = createHash("sha256")
                  .update(stat.size + ":" + stat.mtimeMs)
                  .digest("hex")
                  .slice(0, 16);
                const old = this.db.prepare("SELECT version,error FROM photos WHERE id=?").get(id);
                const cached =
                  old?.version === version &&
                  !old.error &&
                  (await Promise.all(
                    ["thumb", "preview", ...(isVideo(file) ? ["video"] : [])].map((kind) =>
                      fs
                        .access(
                          path.join(
                            this.config.stateDir,
                            "thumbs",
                            `${id}-${version}-${kind}.${kind === "video" ? "mp4" : "webp"}`,
                          ),
                        )
                        .then(
                          () => true,
                          () => false,
                        ),
                    ),
                  ).then((results) => results.every(Boolean)));
                if (old?.version === version && (cached || (old.error && !retryErrors))) {
                  this.db.prepare("UPDATE photos SET seen=? WHERE id=?").run(scanId, id);
                  this.progress.processed++;
                  continue;
                }
                let meta: any = {};
                let width = 0,
                  height = 0,
                  error: null | string = null;
                try {
                  if (!isVideo(file) && stat.size > 250 * 1024 * 1024) throw new Error("too large");
                  meta =
                    (await exifr
                      .parse(file, { gps: true, tiff: true, exif: true })
                      .catch(() => null)) ?? {};
                  const info = await createDerivatives(file, path.join(this.config.stateDir, "thumbs", `${id}-${version}`));
                  width = info.width; height = info.height;
                  if (info.takenAt !== undefined && Number.isFinite(info.takenAt)) meta.DateTimeOriginal = new Date(info.takenAt);
                  if (info.error) { error = info.error; this.progress.errors++; }
                } catch {
                  error = "미리보기를 만들지 못했어요.";
                  this.progress.errors++;
                }
                const date =
                  meta.DateTimeOriginal instanceof Date
                    ? meta.DateTimeOriginal.getTime()
                    : stat.mtimeMs;
                const latitude =
                  Number.isFinite(meta.latitude) && Math.abs(meta.latitude) <= 90
                    ? meta.latitude
                    : null;
                const longitude =
                  Number.isFinite(meta.longitude) && Math.abs(meta.longitude) <= 180
                    ? meta.longitude
                    : null;
                this.db
                  .prepare(
                    `INSERT INTO photos(id,sourceId,relativePath,name,folder,size,mtime,takenAt,width,height,latitude,longitude,camera,version,error,seen) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET size=excluded.size,mtime=excluded.mtime,takenAt=excluded.takenAt,width=excluded.width,height=excluded.height,latitude=excluded.latitude,longitude=excluded.longitude,camera=excluded.camera,version=excluded.version,error=excluded.error,seen=excluded.seen`,
                  )
                  .run(
                    id,
                    source.id,
                    relativePath,
                    entry.name,
                    path.posix.dirname(relativePath) === "."
                      ? ""
                      : path.posix.dirname(relativePath),
                    stat.size,
                    stat.mtimeMs,
                    Number.isFinite(date) ? date : stat.mtimeMs,
                    width,
                    height,
                    latitude,
                    longitude,
                    [meta.Make, meta.Model].filter(Boolean).join(" ") || null,
                    version,
                    error,
                    scanId,
                  );
                if (old?.version && old.version !== version) {
                  for (const kind of ["thumb", "preview", "video"])
                    await fs
                      .unlink(
                        path.join(
                          this.config.stateDir,
                          "thumbs",
                          `${id}-${old.version}-${kind}.${kind === "video" ? "mp4" : "webp"}`,
                        ),
                      )
                      .catch(() => {});
                }
                this.progress.processed++;
              } catch {
                complete = false;
                this.progress.errors++;
              }
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          };
          await walk(root);
          await this.root(source);
          if (complete) {
            const removed = this.db
              .prepare(
                "SELECT id,version FROM photos WHERE sourceId=? AND (seen IS NULL OR seen!=?)",
              )
              .all(source.id, scanId);
            this.db
              .prepare("DELETE FROM photos WHERE sourceId=? AND (seen IS NULL OR seen!=?)")
              .run(source.id, scanId);
            for (const p of removed)
              for (const kind of ["thumb", "preview", "video"])
                await fs
                  .unlink(
                    path.join(this.config.stateDir, "thumbs", `${p.id}-${p.version}-${kind}.${kind === "video" ? "mp4" : "webp"}`),
                  )
                  .catch(() => {});
          }
          this.db
            .prepare("UPDATE sources SET scannedAt=?,error=? WHERE id=?")
            .run(
              Date.now(),
              complete ? null : "일부 폴더를 읽지 못했어요. 기존 목록을 보존했어요.",
              source.id,
            );
        } catch {
          this.db
            .prepare("UPDATE sources SET error=? WHERE id=?")
            .run("NAS 연결과 폴더 권한을 확인해 주세요.", source.id);
          this.progress.errors++;
        }
      }
    } finally {
      this.scanning = false;
      this.progress.finishedAt = Date.now();
    }
  }
  async close() {
    this.stopped = true;
    if (this.work) await this.work;
    this.db.close();
  }
}
