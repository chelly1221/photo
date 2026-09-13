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
  MapPin,
  Heart,
  Folder,
  CloudUpload,
  Settings,
  Plus,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  ArrowUpRight,
  Menu,
  HardDrive,
  Check,
  LoaderCircle,
  ImageOff,
  LogOut,
  Grid2X2,
} from "lucide-react";
import {
  api,
  json,
  media,
  cache,
  cacheSession,
  clearPrivateCache,
  downloadOriginal,
  type Photo,
  type Source,
} from "./lib/api";
import { registerPlugin } from "@capacitor/core";
const AuthBrowser = registerPlugin<{
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
}>("AuthBrowser");
import {
  ensureTailscale,
  subscribeTailscale,
  getTailscaleSnapshot,
  getServerTailscaleSnapshot,
  logoutTailscale,
  subscribeTailEvents,
} from "./lib/tailscale";
import { backupFiles, backupPhone, native, PhotoBackup } from "./lib/backup";
const MapView = lazy(() => import("./MapView"));
type View = "all" | "favorites" | "folders" | "map" | "backup" | "settings";
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
  ["backup", "백업", CloudUpload],
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
  density,
}: {
  items: Photo[];
  hasMore: boolean;
  loadMore: () => void;
  open: (p: Photo) => void;
  density: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [scroll, setScroll] = useState(0);
  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    obs.observe(container.current!);
    return () => obs.disconnect();
  }, []);
  const columns = Math.max(2, Math.floor(size.width / density));
  const cell = (size.width - 6 * (columns - 1)) / columns;
  const rowHeight = cell + 6;
  const first = Math.max(0, Math.floor(scroll / rowHeight) - 2);
  const last = Math.min(
    Math.ceil(items.length / columns),
    Math.ceil((scroll + size.height) / rowHeight) + 2,
  );
  useEffect(() => {
    if (hasMore && last * columns >= items.length - 24) loadMore();
  }, [last, columns, items.length, hasMore, loadMore]);
  return (
    <div
      className="gallery-scroll"
      ref={container}
      onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      aria-label="사진 목록"
    >
      <div
        className="virtual-gallery"
        style={{ height: Math.ceil(items.length / columns) * rowHeight }}
      >
        {items.slice(first * columns, last * columns).map((p, i) => {
          const index = first * columns + i;
          return (
            <button
              className="photo-tile"
              key={p.id}
              onClick={() => open(p)}
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
              <span className="tile-caption">{date(p.takenAt)}</span>
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button className="load-more" onClick={loadMore}>
          사진 더 불러오기
        </button>
      )}
    </div>
  );
}
function Viewer({
  photo,
  onClose,
  onMove,
  onFavorite,
}: {
  photo: Photo;
  onClose: () => void;
  onMove: (n: number) => void;
  onFavorite: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      onCancel={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onMove(-1);
        if (e.key === "ArrowRight") onMove(1);
      }}
    >
      <header className="viewer-toolbar">
        <button className="icon-button" onClick={onClose} aria-label="사진 닫기">
          <X />
        </button>
        <div className="viewer-title">
          <strong>{photo.name}</strong>
          <span>{date(photo.takenAt)}</span>
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
        <button className="viewer-arrow previous" onClick={() => onMove(-1)} aria-label="이전 사진">
          <ChevronLeft />
        </button>
        <div
          className={"viewer-image " + (zoom > 1 ? "zoomed" : "")}
          onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)}
        >
          <div style={{ transform: `scale(${zoom})` }}>
            <Picture photo={photo} preview />
          </div>
        </div>
        <button className="viewer-arrow next" onClick={() => onMove(1)} aria-label="다음 사진">
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
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [folder, setFolder] = useState<string | undefined>();
  const [sort, setSort] = useState("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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
  const [menu, setMenu] = useState(false);
  const [density, setDensity] = useState(190);
  const [folders, setFolders] = useState<{ sourceId: string; folder: string; count: number }[]>([]);
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
  const generation = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
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
    const t = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
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
    if (search) p.set("q", search);
    if (source) p.set("source", source);
    if (folder !== undefined) p.set("folder", folder);
    if (view === "favorites") p.set("favorite", "true");
    if (from) p.set("from", String(new Date(from + "T00:00:00").getTime()));
    if (to) p.set("to", String(new Date(to + "T23:59:59").getTime()));
    return p;
  }, [search, source, folder, view, sort, from, to]);
  const load = useCallback(
    async (offset = 0) => {
      if (offset && fetching.current) return;
      fetching.current = true;
      setLoading(true);
      const token = offset ? generation.current : ++generation.current;
      const p = params();
      p.set("offset", String(offset));
      const key = "list:" + params().toString();
      try {
        const r = await api<{ items: Photo[]; total: number; next: number | null }>("/photos?" + p);
        if (token !== generation.current) return;
        setItems((old) => (offset ? [...old, ...r.items] : r.items));
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
          if (r) {
            setItems(r.items);
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
    setItems([]);
    setNext(null);
    if (entered) void load();
  }, [load, entered, tail.state === "Running"]);
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
  useEffect(() => {
    if (view === "folders" && tail.state === "Running")
      void api<typeof folders>("/folders")
        .then(setFolders)
        .catch((e) => setError(e.message));
  }, [view, tail.state, status?.total]);
  const loadMore = useCallback(() => {
    if (next !== null && !fetching.current) void load(next);
  }, [next, load]);
  const changeView = (v: View) => {
    setView(v);
    setMenu(false);
    setFolder(undefined);
    setSource("");
    setQuery("");
  };
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
      setItems((items) => items.map((x) => (x.id === p.id ? p : x)));
      void refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await api(
        "/sources",
        json("POST", {
          name: data.get("name"),
          share: data.get("share"),
          folder: data.get("folder") || "",
          backup: data.get("backup") === "on",
        }),
      );
      setAdding(false);
      form.current?.reset();
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
    if (native) await PhotoBackup.configure({ enabled: false, wifiOnly: wifi });
    generation.current++;
    setEntered(false);
    setSelected(null);
    logoutTailscale();
    await clearPrivateCache();
    localStorage.removeItem("photo-entered");
    localStorage.removeItem("photo-auto-backup");
    setAutomatic(false);
    setEntered(false);
    setItems([]);
    setStatus(null);
  };
  useEffect(() => {
    if (native && nativeReady && automatic && tail.state === "Running")
      void backupPhone(setBackupMessage).catch((e) => setBackupMessage(e.message));
  }, [automatic, tail.state, nativeReady]);
  const title = navItems.find((x) => x[0] === view)?.[1] ?? "설정";
  if (!entered)
    return (
      <div className="login-page">
        <div className="login-brand">
          <img src="/favicon.svg" alt="" />
          사진
        </div>
        <main className="login-main">
          <div className="login-icon">
            <Images size={48} strokeWidth={1.2} />
          </div>
          <h1>내 사진이 있는 곳.</h1>
          <p>
            NAS에 담아 둔 순간을
            <br />
            어디서나 가볍게 꺼내 보세요.
          </p>
          <button
            className="primary"
            disabled={["Loading", "Starting"].includes(tail.state)}
            onClick={() => {
              if (tail.state === "Error") location.reload();
              else void ensureTailscale().catch((e) => setError(e.message));
            }}
          >
            <ShieldCheck size={19} />
            Tailscale로 로그인
            <ArrowUpRight size={18} />
          </button>
          {tail.loginUrl && (
            <a
              className="auth-link"
              href={tail.loginUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (native) {
                  e.preventDefault();
                  void AuthBrowser.open({ url: tail.loginUrl }).catch((e) => setError(e.message));
                }
              }}
            >
              Tailscale 계정 인증하기 <ArrowUpRight size={16} />
            </a>
          )}
          <span className="connection-note" role="status">
            {tail.state === "Stopped" ? "별도 VPN 앱 없이, 내 계정으로 안전하게." : tail.message}
          </span>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </main>
        <footer>
          사진 · 나만의 사진 보관함
          <a href="/downloads/photo-0.1.0.apk">
            Android 앱 다운로드 <Download size={15} />
          </a>
        </footer>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "is-open" : "")} inert={isMobile && !menu}>
        <button className="brand" onClick={() => changeView("all")}>
          <img src="/favicon.svg" alt="" />
          <span>사진</span>
        </button>
        <button
          className="add-library"
          onClick={() => {
            changeView("settings");
            setAdding(true);
          }}
        >
          <Plus size={18} />
          공유 폴더 연결
          <Plus size={16} />
        </button>
        <nav aria-label="사진 탐색">
          {navItems.map(([id, name, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => changeView(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{name}</span>
              {id === "all" && <small>{status?.total ?? 0}</small>}
              {id === "favorites" && <small>{status?.favorites ?? 0}</small>}
            </button>
          ))}
        </nav>
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
        <div className="sidebar-bottom">
          <a href="/downloads/photo-0.1.0.apk">
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
          <button className="account" onClick={() => changeView("settings")}>
            <span className="account-icon">
              <ShieldCheck size={20} />
            </span>
            <span>
              나의 사진 보관함
              <small>{tail.state === "Running" ? "보안 연결됨" : "연결 확인 중"}</small>
            </span>
            <span className={"status-dot " + (tail.state === "Running" ? "online" : "")} />
          </button>
        </div>
      </aside>
      {menu && (
        <button className="menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenu(false)} />
      )}
      <main className="workspace">
        <header className="page-header">
          <div className="heading-line">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <div>
              <h1>
                {title}
                {(view === "all" || view === "favorites") && (
                  <span className="count">{total.toLocaleString()}</span>
                )}
              </h1>
              <p>
                {view === "map"
                  ? "사진이 머문 곳을 따라가 보세요."
                  : view === "backup"
                    ? "새로운 순간은 휴대폰에서, 오래도록 NAS에."
                    : view === "settings"
                      ? "사진이 모이는 곳과 연결을 관리해요."
                      : view === "folders"
                        ? "폴더마다 담아 둔 기억들."
                        : "소중한 순간을, 차곡차곡."}
              </p>
            </div>
            <button
              className="icon-button refresh"
              aria-label="새로고침"
              disabled={loading}
              onClick={() => {
                void refreshStatus();
                void load();
              }}
            >
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
          </div>
          {(view === "all" || view === "favorites") && (
            <>
              <div className="search-row">
                <label className="search-box">
                  <Search size={18} />
                  <input
                    ref={searchInput}
                    aria-label="사진 검색"
                    placeholder="파일 이름, 폴더, 카메라로 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <kbd>Ctrl K</kbd>
                </label>
                <button
                  className="icon-button"
                  aria-label="사진 크기 변경"
                  onClick={() => setDensity(density === 190 ? 270 : 190)}
                >
                  <Grid2X2 size={19} />
                </button>
              </div>
              <div className="filter-row">
                <span>
                  {source
                    ? status?.sources.find((s) => s.id === source)?.name
                    : folder !== undefined
                      ? folder
                      : "전체 보관함"}
                  {folder !== undefined && source && ` / ${folder || "최상위"}`}
                </span>
                <div>
                  <input
                    type="date"
                    aria-label="촬영 시작일"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <span>—</span>
                  <input
                    type="date"
                    aria-label="촬영 종료일"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                  {(from || to || source || folder !== undefined) && (
                    <button
                      className="icon-button"
                      aria-label="필터 초기화"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                        setSource("");
                        setFolder(undefined);
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                  <select
                    aria-label="사진 정렬"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="newest">최근 촬영순</option>
                    <option value="oldest">오래된 촬영순</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </header>
        {error && (
          <div className="banner" role="alert">
            <Info size={17} />
            <span>
              {error}
              {offline && " 저장된 사진을 표시하고 있어요."}
            </span>
            <button onClick={() => void load()}>다시 시도</button>
            <button className="icon-button" aria-label="알림 닫기" onClick={() => setError("")}>
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
              items={items}
              hasMore={next !== null}
              loadMore={loadMore}
              open={setSelected}
              density={density}
            />
          ) : (
            <div className="empty-state">
              {loading ? (
                <LoaderCircle className="spin" size={38} />
              ) : view === "favorites" ? (
                <Heart size={42} strokeWidth={1.2} />
              ) : (
                <Images size={46} strokeWidth={1.2} />
              )}
              <h2>
                {loading
                  ? "사진을 불러오고 있어요"
                  : search || from || to
                    ? "조건에 맞는 사진이 없어요"
                    : view === "favorites"
                      ? "마음에 드는 순간을 모아 보세요"
                      : "사진이 모일 자리를 연결해 주세요"}
              </h2>
              <p>
                {view === "favorites"
                  ? "사진을 열고 하트를 누르면 이곳에 모여요."
                  : search || from || to
                    ? "검색어나 촬영일 범위를 바꿔 보세요."
                    : "NAS 공유 폴더를 연결하면 사진과 촬영 정보를 자동으로 정리해요."}
              </p>
              {view === "all" && !search && !from && !to && (
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
            <MapView open={openId} />
          </Suspense>
        )}
        {view === "folders" && (
          <div className="content-scroll">
            <div className="folder-list">
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
                <div className="empty-state">
                  <Folder size={42} />
                  <h2>아직 연결된 사진 폴더가 없어요</h2>
                  <button
                    className="primary"
                    onClick={() => {
                      changeView("settings");
                      setAdding(true);
                    }}
                  >
                    공유 폴더 연결
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {view === "settings" && (
          <div className="content-scroll">
            <div className="settings-content">
              <section>
                <div className="settings-title">
                  <h2>NAS 공유 폴더</h2>
                  <button className="secondary" onClick={() => setAdding(!adding)}>
                    <Plus size={17} />
                    추가
                  </button>
                </div>
                <p>100.75.89.101의 공유 이름을 입력해 연결하세요.</p>
                {adding && (
                  <form ref={form} className="source-form" onSubmit={addSource}>
                    <label>
                      보관함 이름
                      <input name="name" required maxLength={80} placeholder="예: 가족 사진" />
                    </label>
                    <label>
                      NAS 공유 이름
                      <input name="share" required maxLength={128} placeholder="예: Photos" />
                    </label>
                    <label>
                      공유 안의 폴더 <small>선택</small>
                      <input name="folder" placeholder="예: 여행/2026" />
                    </label>
                    <label className="check-label">
                      <input name="backup" type="checkbox" />
                      휴대폰 백업 대상으로 사용
                    </label>
                    <p className="hint">
                      백업 사진은 선택한 폴더의 Photo Backup 안에 저장돼요. 기존 사진은 변경하지
                      않아요.
                    </p>
                    <div className="form-actions">
                      <button type="button" className="secondary" onClick={() => setAdding(false)}>
                        취소
                      </button>
                      <button className="primary" disabled={busy}>
                        {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                        연결하기
                      </button>
                    </div>
                  </form>
                )}
                {status?.sources.map((s) => (
                  <div className="source-row" key={s.id}>
                    <HardDrive size={22} />
                    <div>
                      <strong>{s.name}</strong>
                      <p>
                        {s.share}
                        {s.folder && ` / ${s.folder}`}
                        {s.backup ? " · 백업 가능" : ""}
                      </p>
                      <small>
                        {s.error ||
                          (s.scannedAt
                            ? `마지막 확인 ${date(s.scannedAt)}`
                            : "사진을 준비하고 있어요.")}
                      </small>
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
                <div className="settings-row">
                  <div>
                    <strong>사진 다시 확인</strong>
                    <p>새 사진과 변경된 촬영 정보를 찾고 미리보기를 만들어요.</p>
                  </div>
                  <button
                    className="secondary"
                    disabled={status?.scanning}
                    onClick={() =>
                      void api("/scan", json("POST", {}))
                        .then(refreshStatus)
                        .catch((e) => setError(e.message))
                    }
                  >
                    <RefreshCw size={16} />
                    다시 확인
                  </button>
                </div>
              </section>
              <section>
                <h2>연결과 저장 공간</h2>
                <div className="settings-row">
                  <div>
                    <strong>내장 Tailscale</strong>
                    <p>{tail.message}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (tail.state === "Error") location.reload();
                      else void ensureTailscale().catch((e) => setError(e.message));
                    }}
                  >
                    연결 확인
                  </button>
                </div>
                {tail.loginUrl && (
                  <a
                    className="auth-link"
                    href={tail.loginUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (native) {
                        e.preventDefault();
                        void AuthBrowser.open({ url: tail.loginUrl }).catch((e) =>
                          setError(e.message),
                        );
                      }
                    }}
                  >
                    Tailscale 계정 인증하기
                  </a>
                )}
                <div className="settings-row">
                  <div>
                    <strong>기기에 저장한 미리보기</strong>
                    <p>최근 사진은 연결이 잠시 끊겨도 볼 수 있어요.</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      void cache.media
                        .clear()
                        .then(() => setBackupMessage("기기 미리보기를 비웠어요."))
                    }
                  >
                    비우기
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>계정 로그아웃</strong>
                    <p>이 기기의 사진 목록과 미리보기를 비워요.</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => void signOut().catch((e) => setError(e.message))}
                  >
                    <LogOut size={16} />
                    로그아웃
                  </button>
                </div>
              </section>
              <footer className="app-about">
                <img src="/favicon.svg" alt="" />
                <div>
                  사진 <span>0.1.0</span>
                  <p>나만의 순간, 나만의 보관함.</p>
                </div>
              </footer>
            </div>
          </div>
        )}
        {view === "backup" && (
          <div className="content-scroll">
            <div className="settings-content">
              <section>
                <div className="backup-intro">
                  <CloudUpload size={36} strokeWidth={1.3} />
                  <h2>휴대폰의 순간을 안전하게.</h2>
                  <p>사진을 NAS에 보관하고, 같은 파일은 한 번만 백업해요.</p>
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
                        ? "Android가 백그라운드에서 새 사진을 찾아 백업해요."
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
                    <a className="secondary" href="/downloads/photo-0.1.0.apk">
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
                    사진 선택해서 백업
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
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
                  원본 사진 파일을 그대로 보관해요. 사진당 최대 250MB. Android의 절전 상태에 따라
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
      </main>
      {selected && (
        <Viewer
          photo={selected}
          onClose={() => setSelected(null)}
          onMove={(n) => {
            const index = items.findIndex((p) => p.id === selected.id);
            if (items[index + n]) setSelected(items[index + n]);
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
