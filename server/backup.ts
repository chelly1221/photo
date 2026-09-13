import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Library } from "./library";
type Upload = {
  id: string;
  sourceId: string;
  name: string;
  bytes: number;
  offset: number;
  digest: string;
  createdAt: number;
};
export class Backups {
  private locks = new Set<string>();
  constructor(private lib: Library) {}
  async begin(input: { sourceId: string; name: string; bytes: number; digest: string }) {
    const source = this.lib.source(input.sourceId);
    if (!source.backup || !source.enabled)
      throw new Error("백업을 허용한 공유 폴더를 선택해 주세요.");
    const root=await this.lib.root(source);
    const existing = this.lib.db
      .prepare("SELECT * FROM backups WHERE digest=? AND sourceId=?")
      .get(input.digest, input.sourceId);
    if (existing) {
      try {const file=await this.lib.assertInside(root,path.join(root,String(existing.relativePath)));if((await fs.stat(file)).size===input.bytes)return {complete:true};} catch {/* Restore a missing backup on a later upload. */}
      this.lib.db.prepare('DELETE FROM backups WHERE digest=? AND sourceId=?').run(input.digest,input.sourceId);
    }
    const previous = this.lib.db
      .prepare("SELECT * FROM uploads WHERE digest=? AND sourceId=? AND bytes=?")
      .get(input.digest, input.sourceId, input.bytes) as Upload | undefined;
    if (previous) return { id: previous.id, offset: previous.offset, complete: false };
    const pending = Number(
      this.lib.db.prepare("SELECT coalesce(sum(bytes),0) n FROM uploads").get()?.n ?? 0,
    );
    if (pending + input.bytes > 2 * 1024 ** 3)
      throw Object.assign(
        new Error("백업 대기 공간이 가득 찼어요. 기존 백업을 먼저 완료해 주세요."),
        { statusCode: 507 },
      );
    const id = randomUUID();
    await fs.mkdir(path.join(this.lib.config.stateDir, "uploads"), { recursive: true });
    await fs.writeFile(this.temp(id), new Uint8Array(), { flag: "wx" });
    this.lib.db
      .prepare("INSERT INTO uploads(id,sourceId,name,bytes,digest,createdAt) VALUES(?,?,?,?,?,?)")
      .run(
        id,
        input.sourceId,
        path.basename(input.name).replace(/[^\p{L}\p{N}._ -]/gu, "_"),
        input.bytes,
        input.digest,
        Date.now(),
      );
    return { id, offset: 0, complete: false };
  }
  temp(id: string) {
    return path.join(this.lib.config.stateDir, "uploads", id);
  }
  upload(id: string) {
    const r = this.lib.db.prepare("SELECT * FROM uploads WHERE id=?").get(id) as Upload | undefined;
    if (!r) throw Object.assign(new Error("백업 전송을 다시 시작해 주세요."), { statusCode: 404 });
    return r;
  }
  async chunk(id: string, offset: number, body: Buffer) {
    if (this.locks.has(id))
      throw Object.assign(new Error("이 파일을 전송 중이에요."), { statusCode: 409 });
    this.locks.add(id);
    try {
      const up = this.upload(id);
      if (offset !== up.offset)
        throw Object.assign(new Error("전송 위치를 다시 확인해 주세요."), { statusCode: 409 });
      if (!body.length || body.length > 2 * 1024 ** 2 || offset + body.length > up.bytes)
        throw Object.assign(new Error("전송 크기를 확인해 주세요."), { statusCode: 400 });
      const handle = await fs.open(this.temp(id), "r+");
      try {
        await handle.truncate(offset);
        await handle.write(body, 0, body.length, offset);
        await handle.sync();
      } finally {
        await handle.close();
      }
      this.lib.db.prepare("UPDATE uploads SET offset=? WHERE id=?").run(offset + body.length, id);
      return { offset: offset + body.length };
    } finally {
      this.locks.delete(id);
    }
  }
  async finish(id: string) {
    if (this.locks.has(id))
      throw Object.assign(new Error("이 파일을 전송 중이에요."), { statusCode: 409 });
    this.locks.add(id);
    try {
      const up = this.upload(id);
      if (up.offset !== up.bytes) throw new Error("파일 전송이 아직 끝나지 않았어요.");
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(this.temp(id))) hash.update(chunk);
      if (hash.digest("hex") !== up.digest) {
        await fs.unlink(this.temp(id));
        this.lib.db.prepare('DELETE FROM uploads WHERE id=?').run(id);
        throw new Error("파일 검증에 실패했어요. 다시 백업해 주세요.");
      }
      const source = this.lib.source(up.sourceId);
      if (!source.backup || !source.enabled) throw new Error("백업 폴더가 비활성화됐어요.");
      const root = await this.lib.root(source);
      const directory = path.join(root, "Photo Backup");
      await fs.mkdir(directory, { recursive: true });
      await this.lib.assertInside(root, directory);
      const extension = path.extname(up.name).toLowerCase();
      if (
        ![
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
          ".heic",
          ".heif",
          ".avif",
          ".gif",
          ".tif",
          ".tiff",
        ].includes(extension)
      )
        throw new Error("지원하지 않는 사진 형식이에요.");
      const filename = path.basename(up.name,extension).slice(0,80)+'--'+up.digest+extension;
      const target = path.join(directory, filename);
      const temp = path.join(directory, "." + id + ".part");
      await fs.copyFile(this.temp(id), temp);
      await this.lib.assertInside(root, temp);
      // Atomic no-clobber publication on the same NAS filesystem.
      try {
        await fs.link(temp, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          const check = createHash("sha256");
          for await (const data of createReadStream(await this.lib.assertInside(root, target)))
            check.update(data);
          if (check.digest("hex") !== up.digest)
            throw new Error("대상 파일이 달라 백업을 중단했어요.");
        } else if (
          ["EPERM", "ENOTSUP", "EOPNOTSUPP"].includes((error as NodeJS.ErrnoException).code ?? "")
        )
          await fs.copyFile(temp, target, 1);
        else throw error;
      } finally {
        await fs.unlink(temp).catch(() => {});
      }
      const relativePath = path.relative(root, target).split(path.sep).join("/");
      this.lib.db
        .prepare("INSERT OR REPLACE INTO backups VALUES(?,?,?,?)")
        .run(up.digest, up.sourceId, relativePath, Date.now());
      this.lib.db.prepare("DELETE FROM uploads WHERE id=?").run(id);
      await fs.unlink(this.temp(id));
      this.lib.startScan();
      return { complete: true, relativePath };
    } finally {
      this.locks.delete(id);
    }
  }
}
