import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extensionOf, isRaw, isVideo } from "../src/lib/media-formats";

const run = promisify(execFile);
const tools = { timeout: 90_000, maxBuffer: 32 * 1024 ** 2, windowsHide: true, env: { ...process.env, MAGICK_THREAD_LIMIT: "1" } };
const options = { limitInputPixels: 150_000_000, animated: false };
const maxPlaybackBytes = 128 * 1024 ** 2;

async function raster(file: string, base: string) {
  const image = sharp(file, options).rotate();
  const info = await image.metadata();
  for (const [kind, pixels] of [["thumb", 480], ["preview", 2048]] as const) {
    const target = `${base}-${kind}.webp`;
    await image.clone().resize(pixels, pixels, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "thumb" ? 75 : 85 }).toFile(target + ".tmp");
    await fs.rename(target + ".tmp", target);
  }
  return { width: info.autoOrient?.width ?? info.width ?? 0, height: info.autoOrient?.height ?? info.height ?? 0 };
}

export async function createDerivatives(file: string, base: string): Promise<{ width: number; height: number; takenAt?: number; error?: string | null }> {
  if (!isVideo(file) && !isRaw(file)) {
    try { return await raster(file, base); } catch { /* Try extended server codecs. */ }
  }
  const temporary = await fs.mkdtemp(path.join(path.dirname(base), ".decode-"));
  try {
    if (isVideo(file)) return await video(file, base, temporary);
    const converted = path.join(temporary, "frame.png");
    let embedded: Buffer | undefined;
    if (isRaw(file)) {
      for (const tag of ["JpgFromRaw", "PreviewImage", "OtherImage"]) {
        try {
          const { stdout } = await run("exiftool", ["-b", `-${tag}`, file], { ...tools, encoding: "buffer" });
          if (stdout.length < 128) continue;
          const info = await sharp(stdout, options).metadata();
          if (Math.max(info.width ?? 0, info.height ?? 0) < 1600) { embedded ??= stdout; continue; }
          await fs.writeFile(converted, stdout);
          return await raster(converted, base);
        } catch { /* Decode RAWs without an embedded preview. */ }
      }
    }
    const extension = extensionOf(file);
    if (extension === "jxl") {
      await run("djxl", [file, converted, "--num_threads=1"], tools);
      return await raster(converted, base);
    }
    const coder = isRaw(file) ? "DNG" : ({ hif: "HEIC", jpf: "JP2", jpx: "JP2", dib: "BMP", avifs: "AVIF" } as Record<string, string>)[extension] ?? extension.toUpperCase();
    // Force an image decoder instead of accepting disguised PDF/script delegates.
    try {
      await run("magick", ["-limit", "memory", "128MiB", "-limit", "map", "256MiB", "-limit", "disk", "512MiB", "-limit", "time", "60",
        `${coder}:${file}[0]`, "-auto-orient", "-resize", "2048x2048>", `PNG:${converted}`], tools);
    } catch (error) {
      if (!embedded) throw error;
      await fs.writeFile(converted, embedded);
    }
    return await raster(converted, base);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function video(file: string, base: string, temporary: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file], tools);
  const info = JSON.parse(stdout);
  const stream = info.streams?.find((item: { codec_type: string; disposition?: { attached_pic?: number } }) => item.codec_type === "video" && !item.disposition?.attached_pic);
  if (!stream) throw new Error("No video stream");
  const duration = Number(info.format?.duration ?? stream.duration);
  const frame = path.join(temporary, "poster.png");
  const common = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "file,pipe"];
  const poster = async (seek: number) => {
    await run("ffmpeg", [...common, ...(seek > 0 ? ["-ss", String(seek)] : []), "-i", file, "-map", `0:${stream.index}`, "-frames:v", "1", "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease", frame], tools);
    await fs.access(frame); // Some demuxers exit successfully without output after a seek.
  };
  try { await poster(Number.isFinite(duration) && duration > 0 ? Math.min(3, duration * 0.1) : 0); }
  catch { await poster(0); }
  const dimensions = await raster(frame, base);
  const result = { ...dimensions, width: Number(stream.width) || dimensions.width, height: Number(stream.height) || dimensions.height,
    takenAt: Date.parse(info.format?.tags?.creation_time ?? stream.tags?.creation_time ?? ""), error: null as string | null };
  try {
    if ((await fs.stat(file)).size > 2 * 1024 ** 3) throw new Error("Large video: poster only");
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Unknown video duration");
    const bitrate = Math.min(1500, Math.floor(maxPlaybackBytes * 0.85 * 8 / duration / 1000) - 96);
    if (bitrate < 160) throw new Error("Video too long for a portable playback copy");
    const output = path.join(temporary, "playback.mp4");
    await run("ffmpeg", [...common, "-i", file, "-map", `0:${stream.index}`, "-map", "0:a:0?",
      "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30",
      "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-b:v", `${bitrate}k`,
      "-maxrate", `${bitrate}k`, "-bufsize", `${bitrate * 2}k`, "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", output],
      { ...tools, timeout: 10 * 60_000 });
    if ((await fs.stat(output)).size > maxPlaybackBytes) throw new Error("Playback copy exceeds limit");
    await fs.rename(output, `${base}-video.mp4`);
  } catch {
    result.error = "재생용 영상을 만들지 못했어요. 원본은 NAS에 보존되어 있어요.";
  }
  return result;
}
