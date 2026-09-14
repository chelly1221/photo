import { useEffect, useState, type ReactNode } from "react";
import { Album as AlbumIcon, Check, ChevronLeft, Plus, Play } from "lucide-react";
import { api, json, type Photo } from "./lib/api";
import { isVideo } from "./lib/media-formats";
import { albumDateRange } from "./lib/album-dates";
import type { Album } from "../server/albums";
import PhotoTile from "./PhotoTile";
import { usePhotoSelection, SelectionBar, SelectionMark } from "./PhotoSelection";

type PhotoPage = { items: Photo[]; next: number | null; album?: Album; total?: number };
export default function Albums({ picture, open, remove, refreshToken }: { picture: (photo: Photo) => ReactNode; open: (photo: Photo, items: Photo[]) => void; remove: (photos: Photo[]) => void; refreshToken: number }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [mode, setMode] = useState<"browse" | "add" | "remove">("browse");
  const selection = usePhotoSelection(`${id}:${mode}:${refreshToken}`);
  const [items, setItems] = useState<Photo[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [byPeriod, setByPeriod] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dateRange = albumDateRange(startDate, endDate);
  const needsPeriod = form === "create" && byPeriod;
  const startCreate = () => { setName(""); setByPeriod(false); setStartDate(""); setEndDate(""); setForm("create"); };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const endpoint = mode === "add" ? "/photos?limit=100" : `/albums/${id}?limit=100`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setItems([]); setNext(null); setSelected(new Set());
    if (!id) {
      void api<Album[]>("/albums", { signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) setAlbums(value); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else {
      void api<PhotoPage>(endpoint, { signal: controller.signal })
        .then(value => { if (!controller.signal.aborted) { setItems(value.items); setNext(value.next); if (value.album) setAlbum(value.album); } })
        .catch(e => { if (!controller.signal.aborted) setError(e.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [id, endpoint, revision, refreshToken]);

  const mutate = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const back = () => {
    setForm(null); setConfirmDelete(false); setSelected(new Set()); setError("");
    if (mode !== "browse") setMode("browse");
    else { setId(null); setAlbum(null); }
  };
  const choose = (photo: Photo) => {
    if (mode === "browse") { if (selection.active) selection.toggle(photo); else open(photo, items); return; }
    setSelected(previous => {
      const result = new Set(previous);
      if (result.has(photo.id)) result.delete(photo.id);
      else if (result.size < 200) result.add(photo.id);
      return result;
    });
  };

  return <div className="gallery-region"><div className="content-scroll albums-scroll">
    <div className="albums-content">
      <div className="albums-toolbar">
        {id ? <>
          <button className="icon-button" aria-label={mode === "browse" ? "앨범 목록으로" : "사진 선택 취소"} onClick={back} disabled={busy}><ChevronLeft size={22} /></button>
          <div className="album-heading"><h2>{mode === "add" ? "사진 추가" : album?.name ?? "앨범"}</h2><p>{mode === "browse" ? `${album?.count ?? 0}장` : `${selected.size}장 선택${selected.size === 200 ? " · 한 번에 최대 200장" : ""}`}</p></div>
          {mode === "browse" ? <button className="album-text-action" onClick={() => { setMode("add"); setForm(null); setConfirmDelete(false); }} disabled={busy || loading}><Plus size={18} />사진 추가</button>
            : <button className="primary" disabled={!selected.size || busy} onClick={() => void mutate(async () => {
              await api(`/albums/${id}/photos`, json("POST", { action: mode, ids: [...selected] }));
              setMode("browse"); setSelected(new Set()); setRevision(n => n + 1);
            })}>{busy ? "저장 중…" : mode === "add" ? "추가" : "제거"}</button>}
        </> : <><p className="albums-count">{albums.length}개의 앨범</p><button className="album-text-action" onClick={startCreate} disabled={busy || form === "create"}><Plus size={18} />새 앨범</button></>}
      </div>

      {form && <form className="album-name-form" onSubmit={event => {
        event.preventDefault();
        if (!name.trim() || busy || (needsPeriod && !dateRange)) return;
        void mutate(async () => {
          const result = await api<Album>(form === "create" ? "/albums" : `/albums/${id}`, json(form === "create" ? "POST" : "PATCH", { name: name.trim(), ...(needsPeriod && dateRange ? dateRange : {}) }));
          setId(result.id); setAlbum(result); setForm(null); setRevision(n => n + 1);
        });
      }}>
        <label htmlFor="album-name">{form === "create" ? "새 앨범 이름" : "앨범 이름 변경"}</label>
        <input id="album-name" autoFocus maxLength={80} placeholder="예: 여름 여행" value={name} onChange={event => setName(event.target.value)} disabled={busy} />
        {form === "create" && <fieldset className="album-fill-options" disabled={busy}>
          <legend>사진 담기</legend>
          <div className="album-fill-choice">
            <label><input type="radio" name="album-fill" checked={!byPeriod} onChange={() => setByPeriod(false)} /><span>직접 담기</span></label>
            <label><input type="radio" name="album-fill" checked={byPeriod} onChange={() => setByPeriod(true)} /><span>기간으로 담기</span></label>
          </div>
          {byPeriod ? <>
            <div className="album-date-fields">
              <label>시작일<input type="date" value={startDate} max={endDate || "9999-12-31"} onChange={event => setStartDate(event.target.value)} required /></label>
              <label>종료일<input type="date" value={endDate} min={startDate || "0001-01-01"} max="9999-12-31" onChange={event => setEndDate(event.target.value)} required /></label>
            </div>
            <p className="album-hint">시작일부터 종료일까지 촬영한 사진을 모두 담아요. 만든 뒤 자유롭게 추가하거나 뺄 수 있어요.</p>
            {startDate && endDate && !dateRange && <p className="album-date-error" role="alert">종료일은 시작일과 같거나 이후로 설정해 주세요.</p>}
          </> : <p className="album-hint">빈 앨범을 만든 뒤 원하는 사진을 골라 담아요.</p>}
        </fieldset>}
        <div><button type="button" className="secondary" onClick={() => setForm(null)} disabled={busy}>취소</button><button className="primary" disabled={!name.trim() || busy || (needsPeriod && !dateRange)}>{busy ? "저장 중…" : form === "create" ? "만들기" : "저장"}</button></div>
      </form>}

      {id && mode === "browse" && !form && !confirmDelete && <div className="album-management">
        <button onClick={() => { setName(album?.name ?? ""); setForm("rename"); }} disabled={busy || loading}>이름 변경</button>
        <button onClick={() => { setMode("remove"); setSelected(new Set()); }} disabled={busy || !items.length}>사진 선택</button>
        <button onClick={() => setConfirmDelete(true)} disabled={busy || loading}>앨범 삭제</button>
      </div>}
      {confirmDelete && <div className="album-delete-confirm"><p>이 앨범을 삭제할까요? 사진 원본은 그대로 보관됩니다.</p><div><button className="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>취소</button><button className="secondary" disabled={busy} onClick={() => void mutate(async () => { await api(`/albums/${id}`, { method: "DELETE" }); back(); setRevision(n => n + 1); })}>앨범 삭제</button></div></div>}
      {mode === "remove" && <p className="album-hint">앨범에서만 제거되며, 사진 원본은 유지됩니다.</p>}
      {error && <div className="album-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRevision(n => n + 1)} disabled={busy}>다시 불러오기</button></div>}
      {loading && !items.length ? <p className="album-loading" role="status">불러오는 중…</p> : !id ? (
        albums.length ? <div className="album-grid">{albums.map(value => <button className="album-card" key={value.id} onClick={() => { setId(value.id); setAlbum(value); setForm(null); }}>
          <span className="album-cover">{value.cover ? picture(value.cover) : <AlbumIcon size={32} strokeWidth={1.2} />}</span>
          <strong>{value.name}</strong><span>{value.count}장</span>
        </button>)}</div> : !error && !form && <div className="album-empty"><AlbumIcon size={40} strokeWidth={1.2} /><h2>함께 보고 싶은 순간들</h2><p>여행, 가족, 일상 사진을 앨범으로 모아보세요.</p><button className="primary" onClick={startCreate}><Plus size={18} />첫 앨범 만들기</button></div>
      ) : items.length ? <>
        <div className="album-photo-grid">{items.map(photo => <PhotoTile key={photo.id} photo={photo} onLongPress={mode === "browse" ? selection.start : undefined} className={`album-photo${(mode === "browse" ? selection.photos.has(photo.id) : selected.has(photo.id)) ? " is-selected" : ""}`} onClick={() => choose(photo)} aria-label={photo.name} aria-pressed={mode !== "browse" ? selected.has(photo.id) : selection.active ? selection.photos.has(photo.id) : undefined} disabled={busy || (mode !== "browse" && selected.size >= 200 && !selected.has(photo.id))}>
          {picture(photo)}{isVideo(photo.name) && <Play className="album-video-mark" size={16} fill="currentColor" aria-label="동영상" />}{mode !== "browse" && <span className="album-photo-check" aria-hidden="true">{selected.has(photo.id) && <Check size={15} strokeWidth={2.5} />}</span>}
          {mode === "browse" && selection.active && <SelectionMark selected={selection.photos.has(photo.id)} />}
        </PhotoTile>)}</div>
        {next !== null && <button className="secondary album-load-more" disabled={loading || busy} onClick={() => {
          setLoading(true); setError("");
          void mutate(async () => {
            try { const value = await api<PhotoPage>(`${endpoint}&offset=${next}`); setItems(current => [...current, ...value.items]); setNext(value.next); }
            finally { setLoading(false); }
          });
        }}>{loading ? "불러오는 중…" : "더 보기"}</button>}
      </> : !error && <div className="album-empty"><AlbumIcon size={40} strokeWidth={1.2} /><h2>{mode === "add" ? "보관함에 사진이 없어요" : "첫 사진을 담아보세요"}</h2><p>{mode === "add" ? "설정에서 사진이 있는 폴더를 연결해 주세요." : "여러 폴더의 사진을 한 앨범에 모을 수 있어요."}</p>{mode === "browse" && <button className="primary" onClick={() => setMode("add")}><Plus size={18} />사진 추가</button>}</div>}
    </div>
  </div>
    {selection.active && <SelectionBar count={selection.photos.size} cancel={selection.clear} remove={() => remove([...selection.photos.values()])} />}
  </div>;
}
