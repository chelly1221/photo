import type { Photo } from "./api";

export async function deletePhotos(photos: Photo[], remove: (photo: Photo) => Promise<void>) {
  const deleted: string[] = [];
  const failed: { photo: Photo; message: string }[] = [];
  for (const photo of photos) {
    try { await remove(photo); deleted.push(photo.id); }
    catch (error) { failed.push({ photo, message: error instanceof Error ? error.message : "삭제하지 못했어요." }); }
  }
  return { deleted, failed };
}
