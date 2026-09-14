import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import type { Photo } from "./lib/api";
import type { deletePhotos } from "./lib/delete-photos";

export default function DeletePhotoDialog({ photos, preview, close, remove }: {
  photos: Photo[]; preview: ReactNode; close: () => void; remove: (photos: Photo[]) => ReturnType<typeof deletePhotos>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [remaining, setRemaining] = useState(photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  useEffect(() => { cancelButton.current?.focus(); }, []);
  return <dialog className="photo-delete-dialog" ref={dialog} aria-labelledby="photo-delete-title" aria-describedby="photo-delete-description"
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    {!error && <div className="photo-delete-preview">{preview}</div>}
    <h2 id="photo-delete-title">{remaining.length === 1 ? "원본을 삭제할까요?" : `${remaining.length}장의 원본을 삭제할까요?`}</h2>
    <p id="photo-delete-description">{remaining.length === 1 ? `${remaining[0].name}\n` : ""}NAS 원본과 모든 앨범에서 삭제됩니다. 앱에서 되돌릴 수 없어요.</p>
    {error && <p className="photo-delete-error" role="alert">{error}</p>}
    <button className="photo-delete-action" disabled={busy} onClick={() => {
      setBusy(true); setError("");
      void remove(remaining).then(result => {
        if (!result.failed.length) { close(); return; }
        setRemaining(result.failed.map(item => item.photo));
        setError(`${result.deleted.length ? `${result.deleted.length}장 삭제 완료. ` : ""}${result.failed.length}장을 삭제하지 못했어요. ${result.failed[0].message}`);
        setBusy(false);
      }).catch(error => { setError(error.message); setBusy(false); });
    }}>{busy ? <LoaderCircle className="spin" size={18} /> : <Trash2 size={18} />}{busy ? "삭제 중…" : error ? "남은 사진 다시 삭제" : "원본 삭제"}</button>
    <button className="photo-delete-cancel" ref={cancelButton} disabled={busy} onClick={close} autoFocus>취소</button>
  </dialog>;
}
