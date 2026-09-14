import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import type { Photo } from "./lib/api";

export function usePhotoSelection(resetKey: string | number) {
  const [active, setActive] = useState(false);
  const [photos, setPhotos] = useState<Map<string, Photo>>(new Map());
  const clear = () => { setActive(false); setPhotos(new Map()); };
  useEffect(clear, [resetKey]);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) {
        event.preventDefault(); clear();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [active]);
  return { active, photos, clear,
    start: (photo: Photo) => { setActive(true); setPhotos(current => new Map(current).set(photo.id, photo)); },
    toggle: (photo: Photo) => setPhotos(current => {
      const next = new Map(current);
      if (next.has(photo.id)) next.delete(photo.id); else next.set(photo.id, photo);
      return next;
    }),
  };
}

export function SelectionMark({ selected }: { selected: boolean }) {
  return <span className={`photo-selection-mark${selected ? " checked" : ""}`} aria-hidden="true">{selected && <Check size={14} strokeWidth={2.5} />}</span>;
}

export function SelectionBar({ count, cancel, remove, offline = false }: { count: number; cancel: () => void; remove: () => void; offline?: boolean }) {
  return <div className="photo-selection-bar" role="toolbar" aria-label="선택한 사진 작업">
    <button onClick={cancel}>취소</button>
    <span role="status">{count.toLocaleString()}장 선택</span>
    <button className="selection-delete" disabled={!count || offline} onClick={remove} aria-label={`선택한 사진 ${count}장 삭제`} title={offline ? "온라인에서 삭제할 수 있어요" : "선택한 사진 삭제"}><Trash2 size={20} /></button>
  </div>;
}
