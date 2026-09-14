import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Images,
  Album,
  MapPin,
  Heart,
  Folder,
  CloudUpload,
  Settings,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  HardDrive,
  LogOut,
  Check,
  LoaderCircle,
  ImageOff,
  Play,
} from "lucide-react";
import {
  api,
  json,
  media,
  cache,
  cacheSession,
  endCacheSession,
  forgetDeletedPhoto,
  downloadOriginal,
  type Photo,
  type Source,
} from "./lib/api";
import { AuthBrowser } from "./lib/auth-browser";
import ConnectionScreen from "./ConnectionScreen";
import PhotoTile from "./PhotoTile";
import DeletePhotoDialog from "./DeletePhotoDialog";
import { usePhotoSelection, SelectionBar, SelectionMark } from "./PhotoSelection";
import { deletePhotos } from "./lib/delete-photos";
import {
  ensureTailscale,
  subscribeTailscale,
  getTailscaleSnapshot,
  getServerTailscaleSnapshot,
  logoutTailscale,
  subscribeTailEvents,
} from "./lib/tailscale";
import { backupFiles, backupPhone, native, PhotoBackup } from "./lib/backup";
import { photoSwipe, timelineMonthAt, type PhotoMonth } from "./lib/gallery";
import PhotoTimeline from "./PhotoTimeline";
import { useGalleryPinch } from "./useGalleryPinch";
import { isVideo, mediaAccept } from "./lib/media-formats";
import VideoPlayer from "./VideoPlayer";
import SortToggle from "./SortToggle";
import Albums from "./Albums";
import NasConnect from './NasConnect';
const MapView = lazy(() => import("./MapView"));
type View = "all" | "favorites" | "folders" | "map" | "albums" | "backup" | "settings";
type Status = {
  total: number;
  favorites: number;
  located: number;
  bytes: number;
  sources: Source[];
  scanning: boolean;
  progress: { processed: number; found: number; errors: number; finishedAt: number };
};
const navItems = [
  ["all", "모든 사진", Images],
  ["favorites", "즐겨찾기", Heart],
  ["folders", "폴더", Folder],
  ["map", "지도", MapPin],
  ["albums", "앨범", Album],
] as const;
const date = (n: number) =>
  new Date(n).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
const bytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
function Picture({ photo, preview = false }: { photo: Photo; preview?: boolean }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let object = "";
    setUrl("");
    setError(false);
    void media(photo, preview ? "preview" : "thumb", controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        object = URL.createObjectURL(blob);
        setUrl(object);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => {
      controller.abort();
      if (object) URL.revokeObjectURL(object);
    };
  }, [photo.id, photo.version, preview]);
  return url ? (
    <img src={url} alt={photo.name} decoding="async" />
  ) : (
    <span className="image-placeholder">
      {error || photo.error ? <ImageOff size={24} /> : <LoaderCircle size={20} className="spin" />}
      {preview && (error || photo.error) && <span>미리보기를 표시할 수 없어요.</span>}
    </span>
  );
}
function Gallery({
  items,
  hasMore,
  loadMore,
  open,
  remove,
  selectionKey,
  density,
  changeDensity,
  offset,
  total,
  seek,
  months,
  timelineLoading,
  timelineError,
  retryTimeline,
  offline,
}: {
  items: Photo[];
  hasMore: boolean;
  loadMore: () => void;
  open: (p: Photo) => void;
  remove: (photos: Photo[]) => void;
  selectionKey: string;
  density: number | null;
  changeDensity: (columns: number) => void;
  offset: number;
  total: number;
  seek: (offset: number) => void;
  months: PhotoMonth[];
  timelineLoading: boolean;
  timelineError: string;
  retryTimeline: () => void;
  offline: boolean;
}) {
  const selection = usePhotoSelection(selectionKey);
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [scroll, setScroll] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  const [jumpedMonth, setJumpedMonth] = useState<number | null>(null);
  const jumpScroll = useRef<number | null>(null);
  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    obs.observe(container.current!);
    return () => obs.disconnect();
  }, []);
  const columns = density ?? (size.width < 600 ? 3 : Math.max(2, Math.min(6, Math.floor(size.width / 190))));
  const cell = (size.width - 6 * (columns - 1)) / columns;
  const rowHeight = cell + 6;
  const first = Math.max(0, Math.floor(scroll / rowHeight) - 2);
  const displayedTotal = offline ? offset + items.length : total;
  const pinch = useGalleryPinch(container, { ...size, columns, total: displayedTotal }, changeDensity, setScroll);
  const last = Math.min(
    Math.ceil(displayedTotal / columns),
    Math.ceil((scroll + size.height) / rowHeight) + 2,
  );
  const visibleIndex = Math.min(Math.max(0, displayedTotal - 1), Math.floor(scroll / rowHeight) * columns);
  const activeMonth = Math.max(0, Math.min(months.length - 1,
    jumpedMonth ?? timelineMonthAt(months, Math.min(displayedTotal - 1, visibleIndex + columns - 1))));
  useEffect(() => {
    if (offline) return;
    if (visibleIndex < offset || visibleIndex >= offset + items.length) {
      const timer = setTimeout(() => seek(Math.floor(visibleIndex / 120) * 120), 100);
      return () => clearTimeout(timer);
    }
    if (hasMore && last * columns >= offset + items.length - 24) loadMore();
  }, [visibleIndex, offset, last, columns, items.length, hasMore, loadMore, seek, offline]);
  const start = Math.max(first * columns, offset);
  const end = Math.min(last * columns, offset + items.length);
  const fallbackPhoto = items[Math.max(0, Math.min(items.length - 1, visibleIndex - offset))];
  return (
    <div className={`gallery-region${pinch.active ? " is-pinching" : ""}`}>
      <span className={`gallery-density-hint${pinch.hint ? " is-visible" : ""}`} aria-hidden="true">한 줄에 {columns}장</span>
      <span className="sr-only" role="status" aria-live="polite">한 줄에 사진 {columns}장</span>
      <PhotoTimeline months={months} active={activeMonth} loading={timelineLoading}
        scrolling={scrolling}
        error={offline ? "오프라인에서는 불러온 사진만 탐색할 수 있어요." : timelineError}
        retry={retryTimeline} fallback={fallbackPhoto ? new Date(fallbackPhoto.takenAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long" }) : "사진"}
        jump={(index) => {
          if (!container.current || !months[index] || offline) return;
          const top = Math.floor(months[index].offset / columns) * rowHeight;
          container.current.scrollTo({ top, behavior: "instant" });
          jumpScroll.current = container.current.scrollTop;
          setJumpedMonth(index);
          setScroll(container.current.scrollTop);
        }} />
    <div
      className="gallery-scroll"
      ref={container}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        setScrolling(true);
        clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => setScrolling(false), 1100);
        if (jumpScroll.current === null || Math.abs(top - jumpScroll.current) > 1) {
          setJumpedMonth(null);
          jumpScroll.current = null;
        }
        setScroll(top);
      }}
      aria-label="사진 목록"
    >
      <div
        className="virtual-gallery"
        style={{ height: Math.ceil(displayedTotal / columns) * rowHeight }}
      >
        {Array.from({ length: Math.max(0, (last - first) * columns) }, (_, i) => first * columns + i)
          .filter((index) => index < displayedTotal && (index < offset || index >= offset + items.length))
          .map((index) => <div className="photo-skeleton" key={index} aria-hidden="true"
            style={{ width: cell, height: cell, top: Math.floor(index / columns) * rowHeight, left: (index % columns) * (cell + 6) }} />)}
        {items.slice(Math.max(0, start - offset), Math.max(0, end - offset)).map((p, i) => {
          const index = start + i;
          return (
            <PhotoTile
              className={`photo-tile${selection.photos.has(p.id) ? " is-selected" : ""}`}
              key={p.id}
              photo={p}
              onLongPress={selection.start}
              onClick={() => selection.active ? selection.toggle(p) : open(p)}
              aria-pressed={selection.active ? selection.photos.has(p.id) : undefined}
              style={{
                width: cell,
                height: cell,
                top: Math.floor(index / columns) * rowHeight,
                left: (index % columns) * (cell + 6),
              }}
              aria-label={`${p.name}, ${date(p.takenAt)}${p.favorite ? ", 즐겨찾기" : ""}`}
            >
              <Picture photo={p} />
              {!!p.favorite && <Heart className="tile-heart" size={17} fill="currentColor" />}
              {isVideo(p.name) && <Play className="tile-video" size={16} fill="currentColor" aria-label="동영상" />}
              <span className="tile-caption">{date(p.takenAt)}</span>
              {selection.active && <SelectionMark selected={selection.photos.has(p.id)} />}
            </PhotoTile>
          );
        })}
      </div>
      {hasMore && last * columns >= displayedTotal && (
        <button className="load-more" onClick={loadMore}>
          사진 더 불러오기
        </button>
      )}
    </div>
    {selection.active && <SelectionBar count={selection.photos.size} cancel={selection.clear} offline={offline} remove={() => remove([...selection.photos.values()])} />}
    </div>
  );
}
function Viewer({
  photo,
  onClose,
  onMove,
  onFavorite,
  position,
  count,
  canPrevious,
  canNext,
}: {
  photo: Photo;
  onClose: () => void;
  onMove: (n: number) => void;
  onFavorite: () => void;
  position: number;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const video = isVideo(photo.name);
  useEffect(() => {
    const element = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (element instanceof HTMLElement) element.focus();
    };
  }, []);
  useEffect(() => setZoom(1), [photo.id]);
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await downloadOriginal(photo);
      if (native) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const file = await Filesystem.writeFile({
          path: photo.name,
          data,
          directory: Directory.Cache,
        });
        await Share.share({ url: file.uri, title: photo.name });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = photo.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="viewer"
      aria-label="사진 보기"
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLVideoElement) return;
        if (e.key === "ArrowLeft" && canPrevious) { e.preventDefault(); onMove(-1); }
        if (e.key === "ArrowRight" && canNext) { e.preventDefault(); onMove(1); }
      }}
    >
      <header className="viewer-toolbar">
        <button className="icon-button" onClick={onClose} aria-label="사진 닫기">
          <X />
        </button>
        <div className="viewer-title">
          <strong>{photo.name}</strong>
          <span>{date(photo.takenAt)}{position > 0 && ` · ${position} / ${count}`}</span>
        </div>
        <button
          className="icon-button"
          aria-label="즐겨찾기"
          aria-pressed={!!photo.favorite}
          onClick={onFavorite}
        >
          <Heart fill={photo.favorite ? "currentColor" : "none"} />
        </button>
        <button
          className="icon-button"
          aria-label={zoom === 1 ? "확대" : "축소"}
          disabled={video}
          onClick={() => setZoom(zoom === 1 ? 2 : 1)}
        >
          {zoom === 1 ? <ZoomIn /> : <ZoomOut />}
        </button>
        <button
          className="icon-button"
          aria-label="원본 다운로드"
          onClick={() => void download()}
          disabled={busy}
        >
          {busy ? <LoaderCircle className="spin" /> : <Download />}
        </button>
        <button
          className="icon-button"
          aria-label="사진 정보"
          aria-pressed={details}
          onClick={() => setDetails(!details)}
        >
          <Info />
        </button>
      </header>
      <div className="viewer-body">
        <button className="viewer-arrow previous" disabled={!canPrevious} onClick={() => onMove(-1)} aria-label="이전 사진">
          <ChevronLeft />
        </button>
        <div
          className={"viewer-image " + (zoom > 1 ? "zoomed" : "")}
          onDoubleClick={() => { if (!video) setZoom(zoom === 1 ? 2 : 1); }}
          onTouchStart={(e) => { touch.current = !video && e.touches.length === 1 && zoom === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }}
          onTouchCancel={() => { touch.current = null; }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start || zoom !== 1 || !e.changedTouches.length) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            const direction = photoSwipe(dx, dy, zoom);
            if (direction === 1 && canNext) onMove(1);
            if (direction === -1 && canPrevious) onMove(-1);
          }}
        >
          <div style={{ transform: `scale(${zoom})` }}>
            {video ? <VideoPlayer key={photo.id + photo.version} photo={photo} /> : <Picture photo={photo} preview />}
          </div>
        </div>
        <button className="viewer-arrow next" disabled={!canNext} onClick={() => onMove(1)} aria-label="다음 사진">
          <ChevronRight />
        </button>
        {details && (
          <aside className="photo-details">
            <h2>사진 정보</h2>
            <dl>
              <dt>촬영일</dt>
              <dd>{date(photo.takenAt)}</dd>
              <dt>크기</dt>
              <dd>
                {photo.width} × {photo.height} · {bytes(photo.size)}
              </dd>
              <dt>카메라</dt>
              <dd>{photo.camera || "정보 없음"}</dd>
              <dt>폴더</dt>
              <dd>{photo.folder || "공유 폴더 최상위"}</dd>
              {photo.latitude !== null && (
                <>
                  <dt>촬영 위치</dt>
                  <dd>
                    {photo.latitude.toFixed(5)}, {photo.longitude?.toFixed(5)}
                  </dd>
                </>
              )}
            </dl>
          </aside>
        )}
      </div>
      {error && (
        <p className="viewer-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
export default function App() {
  const tail = useSyncExternalStore(
    subscribeTailscale,
    getTailscaleSnapshot,
    getServerTailscaleSnapshot,
  );
  const [entered, setEntered] = useState(localStorage.getItem("photo-entered") === "yes");
  const [view, setView] = useState<View>("all");
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<Photo[]>([]);
  const [listOffset, setListOffset] = useState(0);
  const [months, setMonths] = useState<PhotoMonth[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineAttempt, setTimelineAttempt] = useState(0);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [source, setSource] = useState("");
  const [folder, setFolder] = useState<string | undefined>();
  const [sort, setSort] = useState("newest");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const change = () => setIsMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [albumViewerItems, setAlbumViewerItems] = useState<Photo[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Photo[] | null>(null);
  const [deleteRevision, setDeleteRevision] = useState(0);
  const [homeRevision, setHomeRevision] = useState(0);
  const [menu, setMenu] = useState(false);
  const navigation = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu || !isMobile) return;
    const panel = navigation.current;
    menuButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); returnHome(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []).filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); menuButton.current?.focus(); };
  }, [menu, isMobile]);
  const [density, setDensity] = useState<number | null>(null);
  const [folders, setFolders] = useState<{ sourceId: string; folder: string; count: number }[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupSource, setBackupSource] = useState(
    localStorage.getItem("photo-backup-source") ?? "",
  );
  const [automatic, setAutomatic] = useState(localStorage.getItem("photo-auto-backup") === "yes");
  const [wifi, setWifi] = useState(true);
  const [nativeReady, setNativeReady] = useState(!native);
  const [nativeLast, setNativeLast] = useState('');
  useEffect(() => {
    if (!native) return;
    void PhotoBackup.status().then((state) => {
      setWifi(state.wifiOnly);
      setAutomatic(state.enabled && state.permission);
      localStorage.setItem('photo-auto-backup', state.enabled && state.permission ? 'yes' : 'no');
      if (state.sourceId) {setBackupSource(state.sourceId);localStorage.setItem('photo-backup-source',state.sourceId);}
      setNativeLast(state.lastSuccess ? `최근 백업 ${new Date(state.lastSuccess).toLocaleString('ko-KR')}${state.outcome==='more'?' · 남은 사진 백업 대기':''}` : '아직 완료한 자동 백업이 없어요.');
      if(state.enabled&&!state.permission){setError('사진 접근 권한이 없어 자동 백업을 멈췄어요. 자동 백업을 다시 켜서 권한을 확인해 주세요.');void PhotoBackup.configure({enabled:false,wifiOnly:state.wifiOnly}).catch(()=>{});}
      setNativeReady(true);
    }).catch((e)=>setError('기기의 백업 설정을 확인하지 못했어요. 앱을 다시 열어 주세요. '+e.message));
  }, []);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const fetching = useRef(false);
  const requestedOffset = useRef(0);
  const generation = useRef(0);
  useEffect(() => {
    if (entered) void ensureTailscale().catch((e) => setError(e.message));
  }, [entered]);
  useEffect(() => {
    if (tail.state === "Running") {
      setEntered(true);
      localStorage.setItem("photo-entered", "yes");
      if (native) void AuthBrowser.close().catch(() => {});
    }
  }, [tail.state]);
  useEffect(() => {
    if ("serviceWorker" in navigator && !native)
      void navigator.serviceWorker
        .register("/sw.js")
        .then((r) => {
          if (r.waiting) setUpdate(r.waiting);
          r.addEventListener("updatefound", () =>
            r.installing?.addEventListener("statechange", () => {
              if (r.waiting && navigator.serviceWorker.controller) setUpdate(r.waiting);
            }),
          );
        })
        .catch(() => {});
  }, []);
  const refreshStatus = useCallback(async () => {
    const expected = cacheSession();
    try {
      const s = await api<Status>("/status");
      if (expected !== cacheSession()) return;
      setStatus(s);
      await cache.records.put({ id: "status", value: s });
    } catch {
      /* gallery owns connection error */
    }
  }, []);
  useEffect(() => {
    if (tail.state !== "Running") return;
    void refreshStatus();
    const timer = setInterval(() => void refreshStatus(), 10000);
    return () => clearInterval(timer);
  }, [tail.state, refreshStatus]);
  const params = useCallback(() => {
    const p = new URLSearchParams({ limit: "120", sort });
    if (source) p.set("source", source);
    if (folder !== undefined) p.set("folder", folder);
    if (view === "favorites") p.set("favorite", "true");
    return p;
  }, [source, folder, view, sort]);
  const load = useCallback(
    async (offset = 0, replace = false) => {
      if (offset && !replace && fetching.current) return;
      if (!offset || replace) requestedOffset.current = offset;
      fetching.current = true;
      setLoading(true);
      const token = offset && !replace ? generation.current : ++generation.current;
      const p = params();
      p.set("offset", String(offset));
      const key = "list:" + params().toString();
      try {
        const r = await api<{ items: Photo[]; total: number; next: number | null }>("/photos?" + p);
        if (token !== generation.current) return;
        setItems((old) => (offset && !replace ? [...old, ...r.items] : r.items));
        if (!offset || replace) setListOffset(offset);
        setTotal(r.total);
        setNext(r.next);
        setOffline(false);
        setError("");
        if (!offset) await cache.records.put({ id: key, value: r });
      } catch (e) {
        if (token !== generation.current) return;
        setError((e as Error).message);
        if (!offset) {
          const r = (await cache.records.get(key))?.value as
            | { items: Photo[]; total: number }
            | undefined;
          if (token !== generation.current) return;
          if (r) {
            setItems(r.items);
            setListOffset(0);
            setTotal(r.total);
            setNext(null);
            setOffline(true);
          }
        }
      } finally {
        if (token === generation.current) {
          setLoading(false);
          fetching.current = false;
        }
      }
    },
    [params],
  );
  useEffect(() => {
    generation.current++;
    setItems([]);
    setListOffset(0);
    setNext(null);
    setTotal(0);
    if (entered) void load();
  }, [load, entered, tail.state === "Running", homeRevision]);
  useEffect(() => {
    setMonths([]);
    setTimelineError("");
    setTimelineLoading(false);
    if (!entered || tail.state !== "Running" || (view !== "all" && view !== "favorites")) return;
    const controller = new AbortController();
    const p = params();
    p.set("timezoneOffset", String(-new Date().getTimezoneOffset()));
    setTimelineLoading(true);
    void api<PhotoMonth[]>("/timeline?" + p, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setMonths(result); })
      .catch(() => { if (!controller.signal.aborted) setTimelineError("연표를 불러오지 못했어요."); })
      .finally(() => { if (!controller.signal.aborted) setTimelineLoading(false); });
    return () => controller.abort();
  }, [params, entered, tail.state, view, timelineAttempt, status?.progress.finishedAt, status?.favorites]);
  const seek = useCallback((offset: number) => { void load(offset, true); }, [load]);
  const catalogVersion = useRef('');
  useEffect(()=>{
    if(!status||status.scanning)return;
    const version=`${status.progress.finishedAt}:${status.total}:${status.favorites}`;
    const previous=catalogVersion.current;catalogVersion.current=version;
    if(previous&&previous!==version&&entered&&tail.state==='Running')void load();
  },[status,entered,tail.state,load]);
  useEffect(() => {
    if (tail.state !== "Running") return;
    return subscribeTailEvents(() => {
      void refreshStatus();
    });
  }, [tail.state, refreshStatus]);
  const refreshFolders = useCallback(async () => {
    const session = cacheSession();
    setFoldersLoading(true);
    setFoldersError("");
    try {
      const result = await api<typeof folders>("/folders");
      if (session === cacheSession()) setFolders(result);
    } catch (e) { if (session === cacheSession()) setFoldersError((e as Error).message); }
    finally { if (session === cacheSession()) setFoldersLoading(false); }
  }, []);
  useEffect(() => {
    if (view === "folders" && tail.state === "Running") void refreshFolders();
  }, [view, tail.state, status?.total, refreshFolders]);
  const loadMore = useCallback(() => {
    if (next !== null && !fetching.current) void load(next);
  }, [next, load]);
  const changeView = (v: View) => {
    if (v === "settings") {
      setView(v);
      setMenu(false);
      return;
    }
    setView(v);
    setMenu(false);
    setFolder(undefined);
    setSource("");
  };
  const returnHome = useCallback(() => {
    setView("all");
    setMenu(false);
    setSelected(null);
    setAlbumViewerItems([]);
    setDeleteTarget(null);
    setAdding(false);
    setSource("");
    setFolder(undefined);
    setSort("newest");
    setDensity(null);
    setError("");
    setHomeRevision(value => value + 1);
  }, []);
  useEffect(() => {
    if (view !== "settings" || menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); returnHome(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [view, menu, returnHome]);
  const openId = useCallback((id: string) => {
    void api<Photo>("/photos/" + id)
      .then(setSelected)
      .catch((e) => setError(e.message));
  }, []);
  const toggleFavorite = async () => {
    if (!selected) return;
    try {
      const p = await api<Photo>(
        `/photos/${selected.id}/favorite`,
        json("PUT", { favorite: !selected.favorite }),
      );
      setSelected(p);
      setAlbumViewerItems(current => current.map(item => item.id === p.id ? p : item));
      setItems((items) => items.map((x) => (x.id === p.id ? p : x)));
      void refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const pickBackup = async (id: string) => {
    try {
      if (native && automatic) await PhotoBackup.configure({ enabled: true, wifiOnly: wifi, sourceId: id });
      setBackupSource(id);
      localStorage.setItem("photo-backup-source", id);
    } catch(e) {setError((e as Error).message);}
  };
  const configureBackup = async (enabled: boolean) => {
    if(!nativeReady)return;
    if (!backupSource) {
      setError("먼저 백업 대상 폴더를 선택해 주세요.");
      return;
    }
    try {
      if (native) await PhotoBackup.configure({ enabled, wifiOnly: wifi, sourceId: backupSource });
      setAutomatic(enabled);
      localStorage.setItem("photo-auto-backup", enabled ? "yes" : "no");
      if (enabled) void backupPhone(setBackupMessage).catch((e) => setError(e.message));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const signOut = async () => {
    if (native) await PhotoBackup.configure({ enabled: false, wifiOnly: wifi, sourceId: backupSource });
    generation.current++;
    setEntered(false);
    setSelected(null);
    setAlbumViewerItems([]);
    logoutTailscale();
    endCacheSession();
    localStorage.removeItem("photo-entered");
    localStorage.setItem("photo-auto-backup", "no");
    setAutomatic(false);
    setItems([]);
    setStatus(null);
  };
  useEffect(() => {
    if (native && nativeReady && automatic && tail.state === "Running")
      void backupPhone(setBackupMessage).catch((e) => setBackupMessage(e.message));
  }, [automatic, tail.state, nativeReady]);
  const title = navItems.find((x) => x[0] === view)?.[1] ?? (view === "backup" ? "백업" : "설정");
  const isGallery = view === "all" || view === "favorites";
  const isCompactHeader = view !== "backup";
  const libraryContext = source
    ? `${status?.sources.find((s) => s.id === source)?.name ?? "보관함"}${folder !== undefined ? ` / ${folder || "최상위"}` : ""}`
    : folder !== undefined ? folder || "최상위 폴더" : "전체 보관함";
  const hasFilters = Boolean(source || folder !== undefined);
  const resetFilters = () => {
    setSource(""); setFolder(undefined);
  };
  const viewerItems = view === "albums" ? albumViewerItems : items;
  const selectedIndex = selected ? viewerItems.findIndex((p) => p.id === selected.id) : -1;
  useEffect(() => {
    if (view !== "albums" && selectedIndex >= 0 && selectedIndex >= items.length - 5 && next !== null) loadMore();
  }, [view, selectedIndex, items.length, next, loadMore]);
  if (!entered) return <ConnectionScreen tail={tail} />;
  return (
    <div className="app-shell">
      <div ref={navigation} className={`navigation-layer${menu ? " is-open" : ""}${menu || view === "settings" ? " has-close-toggle" : ""}${isCompactHeader ? " compact-navigation" : ""}`}
        role={isMobile && menu ? "dialog" : undefined} aria-modal={isMobile && menu ? true : undefined}
        aria-label={isMobile && menu ? "보관함 메뉴" : undefined}>
        <button className="icon-button mobile-menu" ref={menuButton}
          aria-label={menu ? "메뉴 닫기" : view === "settings" ? "설정 닫기" : "메뉴 열기"}
          aria-expanded={view === "settings" && !menu ? undefined : menu}
          aria-controls={view === "settings" && !menu ? undefined : "photo-navigation"}
          onClick={() => menu || view === "settings" ? returnHome() : setMenu(true)}>
          <span className="menu-glyph" aria-hidden="true"><span /><span /><span /></span>
        </button>
      <aside id="photo-navigation" aria-label="보관함 메뉴" className={"sidebar " + (menu ? "is-open" : "")} inert={isMobile && !menu}>
        {isMobile ? <div className="mobile-menu-actions">
          <button className={`icon-button${view === "settings" ? " active" : ""}`}
            aria-label="설정" title="설정" onClick={() => changeView("settings")}>
            <Settings size={21} aria-hidden="true" />
          </button>
          <a className="icon-button" href="/downloads/photo-0.5.2.apk" aria-label="Android 앱 다운로드" title="Android 앱 다운로드">
            <Download size={21} aria-hidden="true" />
          </a>
        </div> : <button className="brand" onClick={() => changeView("all")}>
          <img src="/favicon.svg" alt="" />
          <span>사진</span>
        </button>}
        {!isMobile && <nav aria-label="사진 탐색">
          {navItems.map(([id, name, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => changeView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{name}</span>
              {id === "all" && <small>{status?.total.toLocaleString() ?? "—"}</small>}
              {id === "favorites" && <small>{status?.favorites.toLocaleString() ?? "—"}</small>}
            </button>
          ))}
        </nav>}
        <div className="sidebar-library">
          <div className="section-label">
            내 보관함
            <button
              aria-label="공유 폴더 추가"
              onClick={() => {
                changeView("settings");
                setAdding(true);
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          {status?.sources
            .filter((s) => s.enabled)
            .map((s) => (
              <button
                key={s.id}
                className={source === s.id ? "source-selected" : ""}
                onClick={() => {
                  setView("all");
                  setSource(s.id);
                  setFolder(undefined);
                  setMenu(false);
                }}
              >
                <HardDrive size={17} />
                <span>{s.name}</span>
                {s.error && (
                  <span className="source-warning" title={s.error}>
                    !
                  </span>
                )}
              </button>
            ))}
          {!status?.sources.length && <p>연결한 폴더가 없어요.</p>}
        </div>
        {!isMobile && <div className="sidebar-bottom">
          <a href="/downloads/photo-0.5.2.apk">
            <Download size={18} />
            Android 앱 다운로드
          </a>
          <button
            onClick={() => changeView("settings")}
            className={view === "settings" ? "active" : ""}
          >
            <Settings size={18} />
            설정
          </button>
        </div>}
      </aside>
      </div>
      <main className="workspace" inert={isMobile && menu}>
        <header className={`page-header${isCompactHeader ? " gallery-header" : ""}${view === "settings" ? " settings-header" : ""}`}>
          <div className="heading-line">
            <span className="mobile-menu-space" aria-hidden="true" />
            {view === "settings" && !isMobile && <button className="icon-button" aria-label="설정 닫기" onClick={returnHome}><X size={22} /></button>}
            {isGallery ? <>
              <h1 className="sr-only">{title}</h1>
              <span className="library-context" title={libraryContext}>{libraryContext}</span>
              <span className="gallery-count" aria-live="polite">{loading && !items.length ? "…" : `${total.toLocaleString()}장`}</span>
              <SortToggle value={sort} onChange={setSort} />
            </> : isCompactHeader ? <h1 className="library-context">{title}</h1> : <div>
              <h1>
                {title}
              </h1>
              {view === "backup" && <p>새로운 순간은 휴대폰에서, 오래도록 NAS에.</p>}
            </div>}
            {view === "backup" && <button
              className="icon-button refresh"
              aria-label="새로고침"
              disabled={loading}
              onClick={() => {
                void refreshStatus();
                void load();
              }}
            >
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>}
          </div>
        </header>
        {error && (
          <div className="banner" role="alert">
            <Info size={17} />
            <span>
              {error}
              {offline && " 저장된 사진을 표시하고 있어요."}
            </span>
            <button onClick={() => void load(requestedOffset.current, true)}>다시 시도</button>
            <button className="icon-button" aria-label="알림 닫기" onClick={returnHome}>
              <X size={16} />
            </button>
          </div>
        )}
        {status?.scanning && (
          <div className="scan-status" role="status">
            <LoaderCircle size={14} className="spin" />
            사진 준비 중 · {status.progress.processed.toLocaleString()}장 처리
            <button onClick={() => void load()}>목록 갱신</button>
          </div>
        )}
        {(view === "all" || view === "favorites") &&
          (items.length ? (
            <Gallery
              key={homeRevision}
              items={items}
              hasMore={next !== null}
              loadMore={loadMore}
              open={setSelected}
              remove={setDeleteTarget}
              selectionKey={`${view}:${source}:${folder}:${sort}:${deleteRevision}`}
              density={density}
              changeDensity={setDensity}
              offset={listOffset}
              total={total}
              seek={seek}
              months={months}
              timelineLoading={timelineLoading}
              timelineError={timelineError}
              retryTimeline={() => setTimelineAttempt((attempt) => attempt + 1)}
              offline={offline}
            />
          ) : (
            <div className="empty-state" role="status">
              {loading ? (
                <LoaderCircle className="spin" size={38} />
              ) : error ? <Info size={38} strokeWidth={1.2} /> : hasFilters ? <Folder size={38} strokeWidth={1.2} /> : view === "favorites" ? (
                <Heart size={42} strokeWidth={1.2} />
              ) : (
                <Images size={46} strokeWidth={1.2} />
              )}
              <h2>
                {loading
                  ? "사진을 불러오고 있어요"
                  : error ? "사진을 불러오지 못했어요"
                  : hasFilters
                    ? "조건에 맞는 사진이 없어요"
                    : view === "favorites"
                      ? "마음에 드는 순간을 모아 보세요"
                      : status?.sources.length ? status.scanning ? "사진을 정리하고 있어요" : "아직 보관함에 사진이 없어요"
                      : "사진이 모일 자리를 연결해 주세요"}
              </h2>
              <p>
                {loading ? "사진과 촬영 정보를 가져오고 있어요."
                  : error ? "연결 상태를 확인하고 다시 시도해 주세요."
                  : hasFilters ? "다른 폴더를 선택하거나 전체 보관함을 확인해 보세요."
                  : view === "favorites"
                  ? "사진을 열고 하트를 누르면 이곳에 모여요."
                  : status?.sources.length ? status.scanning ? "준비된 사진부터 보관함에 나타나요." : "연결한 폴더에 사진을 추가한 뒤 다시 확인해 주세요."
                    : "NAS 공유 폴더를 연결하면 사진과 촬영 정보를 자동으로 정리해요."}
              </p>
              {!loading && !error && hasFilters && <button className="secondary" onClick={resetFilters}>전체 보관함 보기<ChevronRight size={17} /></button>}
              {!loading && error && <button className="secondary" onClick={() => void load()}><RefreshCw size={17} />다시 불러오기</button>}
              {!loading && !error && !hasFilters && view === "favorites" && <button className="secondary" onClick={() => changeView("all")}>모든 사진 보기<ChevronRight size={17} /></button>}
              {!loading && !error && view === "all" && !hasFilters && !status?.sources.length && (
                <button
                  className="primary"
                  onClick={() => {
                    changeView("settings");
                    setAdding(true);
                  }}
                >
                  <Plus size={18} />
                  공유 폴더 연결
                </button>
              )}
            </div>
          ))}
        {view === "map" && (
          <Suspense fallback={<div className="empty-state">지도를 준비하고 있어요.</div>}>
            <MapView open={openId} close={returnHome} />
          </Suspense>
        )}
        {view === "folders" && (
          <div className="content-scroll">
            <div className="folder-list">
              {foldersError && folders.length > 0 && <div className="banner" role="alert"><span>{foldersError}</span><button onClick={() => void refreshFolders()}>다시 불러오기</button></div>}
              {folders.map((f) => (
                <button
                  key={f.sourceId + f.folder}
                  onClick={() => {
                    setView("all");
                    setSource(f.sourceId);
                    setFolder(f.folder);
                  }}
                >
                  <Folder size={25} />
                  <span>
                    <strong>{f.folder || "최상위 폴더"}</strong>
                    <small>{status?.sources.find((s) => s.id === f.sourceId)?.name}</small>
                  </span>
                  <span>{f.count.toLocaleString()}장</span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!folders.length && (
                <div className="empty-state" role="status">
                  {foldersLoading ? <LoaderCircle size={38} className="spin" /> : <Folder size={42} />}
                  <h2>{foldersLoading ? "폴더를 불러오고 있어요" : foldersError ? "폴더를 불러오지 못했어요" : status?.sources.length ? "아직 사진이 있는 폴더가 없어요" : "아직 연결된 사진 폴더가 없어요"}</h2>
                  {foldersError && <><p>{foldersError}</p><button className="secondary" onClick={() => void refreshFolders()}>다시 불러오기</button></>}
                  {!foldersLoading && !foldersError && !status?.sources.length &&
                  <button
                    className="primary"
                    onClick={() => {
                      changeView("settings");
                      setAdding(true);
                    }}
                  >
                    공유 폴더 연결
                  </button>}
                </div>
              )}
            </div>
          </div>
        )}
        {view === "albums" && <Albums refreshToken={deleteRevision} remove={setDeleteTarget} picture={photo => <Picture photo={photo} />} open={(photo, photos) => { setAlbumViewerItems(photos); setSelected(photo); }} />}
        {view === "settings" && (
          <div className="content-scroll preferences-scroll">
            <div className="settings-content preferences-content">
              <section>
                <button className="settings-backup-link" onClick={() => changeView("backup")}>
                  <CloudUpload size={21} aria-hidden="true" /><span><strong>사진 백업</strong></span><ChevronRight size={18} aria-hidden="true" />
                </button>
              </section>
              <section>
                <div className="settings-title">
                  <h2>NAS 공유 폴더</h2>
                  <button className="secondary" onClick={() => setAdding(true)} disabled={adding}>
                    <Plus size={17} />
                    추가
                  </button>
                </div>
                {!status?.sources.length && <p>사진을 보관할 NAS 폴더를 연결하세요.</p>}
                {adding && <NasConnect onCancel={() => setAdding(false)} onConnected={async () => {setAdding(false);await refreshStatus();}} />}
                {status?.sources.map((s) => (
                  <div className="source-row" key={s.id}>
                    <HardDrive size={20} aria-hidden="true" />
                    <div>
                      <strong>{s.name}</strong>
                      <p>{!s.enabled ? "연결 일시 중지" : s.error ? "연결 확인 필요" : s.backup ? "연결됨 · 백업 가능" : "연결됨"}</p>
                      <details className="source-details">
                        <summary>폴더 정보</summary>
                        <p>{s.host && `${s.host} · ${s.protocol?.toUpperCase()} · `}{s.share || "NAS 최상위"}{s.folder && ` / ${s.folder}`}</p>
                        <small>{s.error || (s.scannedAt ? `마지막 확인 ${date(s.scannedAt)}` : "사진을 준비하고 있어요.")}</small>
                      </details>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        void api(`/sources/${s.id}`, json("PUT", { enabled: !s.enabled }))
                          .then(refreshStatus)
                          .catch((e) => setError(e.message))
                      }
                    >
                      {s.enabled ? "연결 중지" : "다시 연결"}
                    </button>
                  </div>
                ))}
              </section>
              <section>
                <div className="settings-row">
                  <ShieldCheck size={21} aria-hidden="true" />
                  <div>
                    <strong>Tailscale</strong>
                    <p>{tail.state === "Running" ? "연결됨" : tail.message}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (tail.state !== "Running") setEntered(false);
                      else void refreshStatus();
                    }}
                  >
                    연결 확인
                  </button>
                </div>

              </section>
              <section>
                  <button
                    className="settings-logout"
                    onClick={() => void signOut().catch((e) => setError(e.message))}
                  >
                    <LogOut size={21} aria-hidden="true" /><span>로그아웃</span>
                  </button>
              </section>
              <footer className="preferences-version">사진 <span>0.5.2</span></footer>
            </div>
          </div>
        )}
        {view === "backup" && (
          <div className="content-scroll">
            <div className="settings-content">
              <button className="album-text-action backup-settings-back" onClick={() => changeView("settings")}><ChevronLeft size={18} />설정으로</button>
              <section>
                <div className="backup-intro">
                  <CloudUpload size={36} strokeWidth={1.3} />
                  <h2>휴대폰의 순간을 안전하게.</h2>
                  <p>사진과 동영상을 NAS에 보관하고, 같은 파일은 한 번만 백업해요.</p>
                </div>
                <label className="field-label">
                  백업 대상
                  <select value={backupSource} disabled={!nativeReady} onChange={(e) => void pickBackup(e.target.value)}>
                    <option value="">폴더 선택</option>
                    {status?.sources
                      .filter((s) => s.backup && s.enabled)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} / Photo Backup
                        </option>
                      ))}
                  </select>
                </label>
                {!status?.sources.some((s) => s.backup && s.enabled) && (
                  <p className="hint">
                    공유 폴더를 추가할 때 ‘휴대폰 백업 대상으로 사용’을 켜 주세요.{" "}
                    <button
                      className="text-button"
                      onClick={() => {
                        changeView("settings");
                        setAdding(true);
                      }}
                    >
                      폴더 연결
                    </button>
                  </p>
                )}
                <div className="settings-row">
                  <div>
                    <strong>사진 자동 백업</strong>
                    <p>
                      {native
                        ? "Android가 백그라운드에서 새 사진과 동영상을 찾아 백업해요."
                        : "Android 앱을 설치하면 앱을 닫아도 자동으로 백업해요."}
                    </p>
                  </div>
                  {native ? (
                    <button
                      role="switch"
                      aria-label="사진 자동 백업"
                      aria-checked={automatic}
                      disabled={!nativeReady}
                      className={"switch " + (automatic ? "on" : "")}
                      onClick={() => void configureBackup(!automatic)}
                    >
                      <span />
                    </button>
                  ) : (
                    <a className="secondary" href="/downloads/photo-0.5.2.apk">
                      앱 다운로드
                      <Download size={16} />
                    </a>
                  )}
                </div>
                {native && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={wifi}
                      disabled={!nativeReady}
                      onChange={async (e) => {
                        const value=e.target.checked;
                        try {await PhotoBackup.configure({enabled:automatic,wifiOnly:value,sourceId:backupSource});setWifi(value);}
                        catch(error){setError((error as Error).message);}
                      }}
                    />
                    Wi-Fi에서만 자동 백업
                  </label>
                )}
                <div className="backup-actions">
                  <label
                    className={"primary file-button " + (!backupSource || busy ? "disabled" : "")}
                  >
                    <Plus size={17} />
                    사진·동영상 선택해서 백업
                    <input
                      type="file"
                      accept={mediaAccept}
                      multiple
                      disabled={!backupSource || busy}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (!files.length) return;
                        setBusy(true);
                        try {
                          await backupFiles(files, backupSource, setBackupMessage);
                          void refreshStatus();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>
                  {native && (
                    <button
                      className="secondary"
                      disabled={!backupSource || busy || !automatic}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await backupPhone(setBackupMessage);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      지금 백업
                    </button>
                  )}
                </div>
                <p className="backup-progress" role="status">
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : backupMessage ? (
                    <Check size={17} />
                  ) : null}
                  {backupMessage}
                </p>
                {native&&<p className="hint">{nativeReady?nativeLast:'기기의 백업 설정을 확인하고 있어요.'}</p>}
                <p className="hint">
                  원본 파일을 그대로 보관해요. 사진은 250MB, 동영상은 2GB까지. Android의 절전 상태에 따라
                  자동 백업이 늦어질 수 있어요.
                </p>
              </section>
            </div>
          </div>
        )}
        <footer className="workspace-status">
          <span className={"status-dot " + (tail.state === "Running" ? "online" : "")} />
          {offline
            ? "저장된 사진 표시 중"
            : tail.state === "Running"
              ? "내 NAS에 안전하게 연결됨"
              : "보안 연결 확인 중"}
          <span>{status?.total ?? 0}장의 순간</span>
        </footer>
        {view !== "settings" && view !== "backup" && <nav className="mobile-navigation" aria-label="주요 화면">
          {navItems.map(([id, name, Icon]) => <button key={id} aria-label={id === "all" ? "사진" : name} title={id === "all" ? "사진" : name} aria-current={view === id ? "page" : undefined} onClick={() => changeView(id)}><Icon size={22} strokeWidth={view === id ? 2 : 1.6} aria-hidden="true" /></button>)}
        </nav>}
      </main>
      {deleteTarget?.length ? <DeletePhotoDialog photos={deleteTarget} preview={<Picture photo={deleteTarget[0]} />}
        close={() => setDeleteTarget(null)} remove={async photos => {
          const result = await deletePhotos(photos, async photo => {
            await api(`/photos/${photo.id}`, json("DELETE", { version: photo.version, confirmOriginal: true }));
            generation.current++;
            setItems(current => current.filter(item => item.id !== photo.id));
            setAlbumViewerItems(current => current.filter(item => item.id !== photo.id));
            setSelected(current => current?.id === photo.id ? null : current);
            await forgetDeletedPhoto(photo.id).catch(() => {});
          });
          if (result.deleted.length) setDeleteRevision(value => value + 1);
          await refreshStatus();
          if (isGallery) await load(Math.min(listOffset, Math.floor(Math.max(0, total - result.deleted.length - 1) / 120) * 120));
          return result;
        }} /> : null}
      {selected && (
        <Viewer
          photo={selected}
          position={selectedIndex < 0 ? 0 : (view === "albums" ? 0 : listOffset) + selectedIndex + 1}
          count={view === "albums" ? viewerItems.length : total}
          canPrevious={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < viewerItems.length - 1}
          onClose={returnHome}
          onMove={(n) => {
            const index = viewerItems.findIndex((p) => p.id === selected.id);
            if (index >= 0 && viewerItems[index + n]) setSelected(viewerItems[index + n]);
          }}
          onFavorite={() => void toggleFavorite()}
        />
      )}
      {update && (
        <div className="update-toast">
          <span>새 버전이 준비됐어요.</span>
          <button
            className="primary"
            onClick={() => {
              update.postMessage("SKIP_WAITING");
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => location.reload(),
                { once: true },
              );
            }}
          >
            업데이트
          </button>
        </div>
      )}
    </div>
  );
}
