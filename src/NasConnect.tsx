import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Folder,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, json } from "./lib/api";
import type { NasListing, NasOption } from "../server/nas";

type Discovery = { scanId: string; host: string; options: NasOption[] };
type Connection = { connectionId: string; host: string; protocol: string; listing: NasListing };
export default function NasConnect({
  onCancel,
  onConnected,
}: {
  onCancel: () => void;
  onConnected: () => Promise<void>;
}) {
  const [host, setHost] = useState("100.75.89.101");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [option, setOption] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [listing, setListing] = useState<NasListing | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [backup, setBackup] = useState(false);
  const alive = useRef(true);
  const activeConnection = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const location = useRef<HTMLElement>(null);
  const step = connection ? "folder" : discovery ? "protocol" : "address";
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (activeConnection.current)
        void api("/nas/forget", json("POST", { connectionId: activeConnection.current })).catch(
          () => {},
        );
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (listing?.path) location.current?.focus({ preventScroll: true });
  }, [listing?.path]);
  async function work(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function discover(event: React.FormEvent) {
    event.preventDefault();
    await work("사용 가능한 연결 방식을 찾고 있어요.", async () => {
      const found = await api<Discovery>("/nas/discover", json("POST", { host: host.trim() }));
      if (!alive.current) return;
      setDiscovery(found);
      setOption(found.options.find((o) => o.available)?.id ?? "");
    });
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!discovery) return;
    await work("계정을 확인하고 폴더를 불러오고 있어요.", async () => {
      const found = await api<Connection>(
        "/nas/connect",
        json("POST", { scanId: discovery.scanId, optionId: option, username, password }),
      );
      if (!alive.current) {
        void api("/nas/forget", json("POST", { connectionId: found.connectionId })).catch(() => {});
        return;
      }
      activeConnection.current = found.connectionId;
      setPassword("");
      setConnection(found);
      setListing(found.listing);
      setName("내 NAS 사진");
    });
  }
  async function browse(path: string, offset = 0) {
    if (!connection) return;
    await work("폴더를 불러오고 있어요.", async () => {
      const found = await api<NasListing>(
        "/nas/browse",
        json("POST", { connectionId: connection.connectionId, path, offset }),
      );
      if (!alive.current) return;
      setListing((previous) =>
        offset && previous?.path === found.path
          ? { ...found, folders: [...previous.folders, ...found.folders] }
          : found,
      );
      if (!offset) {
        setFilter("");
        setName(path.split("/").pop() || "내 NAS 사진");
      }
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!connection || !listing) return;
    await work("선택한 폴더를 보관함에 연결하고 있어요.", async () => {
      await api(
        "/nas/sources",
        json("POST", {
          connectionId: connection.connectionId,
          path: listing.path,
          name: name.trim(),
          backup,
        }),
      );
      if (alive.current) await onConnected();
    });
  }
  const canSelect = Boolean(listing && (connection?.protocol !== "smb" || listing.path));
  const crumbs = listing?.path.split("/").filter(Boolean) ?? [];
  const filtered =
    listing?.folders.filter((f) =>
      f.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    ) ?? [];
  return (
    <div className="nas-connect" aria-busy={Boolean(busy)}>
      <div className="nas-heading">
        <HardDrive size={22} />
        <div>
          <h3 ref={heading} tabIndex={-1}>
            {step === "address"
              ? "NAS에 연결"
              : step === "protocol"
                ? "연결 방식 선택"
                : "사진이 있는 폴더 선택"}
          </h3>
          <p>
            {step === "address"
              ? "NAS 정보만 입력하면 연결 방식과 폴더를 찾을 수 있어요."
              : step === "protocol"
                ? `${discovery?.host}에서 찾은 연결 방식이에요.`
                : `${connection?.host} · ${connection?.protocol.toUpperCase()}`}
          </p>
        </div>
      </div>
      <ol className="nas-steps" aria-label="NAS 연결 단계">
        {["NAS 정보", "연결 방식", "폴더 선택"].map((label, index) => (
          <li
            key={label}
            aria-current={
              index === (step === "address" ? 0 : step === "protocol" ? 1 : 2) ? "step" : undefined
            }
          >
            {label}
          </li>
        ))}
      </ol>
      <div className="nas-feedback" aria-live="polite">
        {busy && (
          <p role="status">
            <LoaderCircle className="spin" size={16} />
            {busy}
          </p>
        )}
        {error && (
          <p className="nas-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {step === "address" && (
        <form className="source-form nas-fields" onSubmit={discover}>
          <label>
            NAS IP 주소
            <input
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="예: 100.75.89.101"
              autoComplete="off"
              inputMode="decimal"
              disabled={Boolean(busy)}
            />
          </label>
          <div className="nas-account">
            <label>
              계정
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={256}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={Boolean(busy)}
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={1024}
                autoComplete="current-password"
                disabled={Boolean(busy)}
              />
            </label>
          </div>
          <p className="hint">
            서버에서 접근할 수 있는 사설 IP 또는 Tailscale IP를 입력하세요. 비밀번호는 선택한
            방식으로 로그인할 때 사용해요.
          </p>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onCancel} disabled={Boolean(busy)}>
              취소
            </button>
            <button className="primary" disabled={Boolean(busy)}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />}연결 방식
              찾기
            </button>
          </div>
        </form>
      )}
      {step === "protocol" && (
        <form onSubmit={connect}>
          <fieldset className="nas-protocols" disabled={Boolean(busy)}>
            <legend className="sr-only">사용할 프로토콜</legend>
            {discovery?.options.map((item) => (
              <label
                key={item.id}
                className={`nas-protocol ${item.available ? "" : "unavailable"}`}
              >
                <input
                  type="radio"
                  name="protocol"
                  value={item.id}
                  checked={option === item.id}
                  disabled={!item.available}
                  onChange={() => setOption(item.id)}
                />
                <span>
                  <strong>
                    {item.label}
                    <small>
                      {item.port}
                      {item.protocol === "webdav" ? (item.secure ? " · HTTPS" : " · HTTP") : ""}
                    </small>
                  </strong>
                  <span>{item.detail}</span>
                  {item.fingerprint && (
                    <small className="nas-fingerprint">서버 키 {item.fingerprint}</small>
                  )}
                </span>
                {item.secure && item.available && <ShieldCheck size={18} />}
              </label>
            ))}
          </fieldset>
          {!discovery?.options.length && (
            <div className="nas-empty">
              <p>연결 가능한 서비스를 찾지 못했어요.</p>
              <span>
                NAS에서 SMB, SFTP 또는 WebDAV를 켜고 방화벽과 서버의 네트워크 연결을 확인해 주세요.
              </span>
            </div>
          )}
          <p className="hint">
            선택하면 입력한 NAS 계정으로 폴더 접근 권한을 확인해요. SFTP는 표시된 서버 키를 저장하고
            이후 변경되면 연결을 중지해요.
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setDiscovery(null);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              정보 수정
            </button>
            <button className="primary" disabled={Boolean(busy) || !option}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Folder size={17} />}폴더 탐색
            </button>
          </div>
        </form>
      )}
      {step === "folder" && listing && (
        <>
          <div className="nas-browser">
            <nav
              ref={location}
              tabIndex={-1}
              className="nas-breadcrumbs"
              aria-label="현재 NAS 폴더"
            >
              <button disabled={Boolean(busy)} onClick={() => void browse("")}>
                NAS
              </button>
              {crumbs.map((part, index) => (
                <span key={index}>
                  <ChevronRight size={14} />
                  <button
                    disabled={Boolean(busy)}
                    aria-current={index === crumbs.length - 1 ? "location" : undefined}
                    onClick={() => void browse(crumbs.slice(0, index + 1).join("/"))}
                  >
                    {part}
                  </button>
                </span>
              ))}
            </nav>
            <div className="nas-browser-tools">
              <button
                className="secondary"
                disabled={Boolean(busy) || !listing.path}
                onClick={() => void browse(crumbs.slice(0, -1).join("/"))}
              >
                <ArrowLeft size={16} />
                상위 폴더
              </button>
              <label>
                <Search size={16} />
                <input
                  aria-label="현재 목록에서 폴더 찾기"
                  placeholder="목록에서 찾기"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <button
                className="icon-button"
                aria-label="폴더 새로고침"
                disabled={Boolean(busy)}
                onClick={() => void browse(listing.path)}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <div className="nas-folder-list" aria-label="폴더 목록">
              {filtered.map((folder) => (
                <button
                  className="nas-folder"
                  key={folder.path}
                  disabled={Boolean(busy)}
                  onClick={() => void browse(folder.path)}
                >
                  <Folder size={20} />
                  <span>{folder.name}</span>
                  <ChevronRight size={17} />
                </button>
              ))}
              {!filtered.length && (
                <div className="nas-empty">
                  <Folder size={24} />
                  <p>{filter ? "일치하는 폴더가 없어요." : "하위 폴더가 없어요."}</p>
                  <span>
                    {filter
                      ? "다른 이름으로 찾아보세요."
                      : canSelect
                        ? "사진이 있는 현재 폴더를 바로 연결할 수 있어요."
                        : "계정에 공유 폴더 접근 권한이 있는지 확인해 주세요."}
                  </span>
                </div>
              )}
              {listing.next !== null && (
                <button
                  className="nas-more secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void browse(listing.path, listing.next!)}
                >
                  폴더 더 보기
                </button>
              )}
            </div>
          </div>
          <form className="source-form nas-fields" onSubmit={save}>
            <div className="nas-selected">
              {canSelect ? (
                <>
                  <Check size={17} />
                  <span>
                    선택한 위치<strong>{listing.path || "NAS 최상위"}</strong>
                  </span>
                </>
              ) : (
                <>
                  <Folder size={17} />
                  <span>연결할 공유 폴더를 열어 주세요.</span>
                </>
              )}
            </div>
            <label>
              보관함 이름
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                disabled={Boolean(busy)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={backup}
                onChange={(e) => setBackup(e.target.checked)}
                disabled={Boolean(busy)}
              />
              휴대폰 백업 대상으로 사용
            </label>
            <p className="hint">
              백업 사진은 선택한 폴더의 Photo Backup 안에 저장돼요. 기존 사진은 변경하지 않아요.
              연결 정보는 서버에만 보관해 다음에도 자동으로 연결해요.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                disabled={Boolean(busy)}
                onClick={onCancel}
              >
                취소
              </button>
              <button className="primary" disabled={Boolean(busy) || !canSelect || !name.trim()}>
                {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}이 폴더
                연결
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
