import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { RefreshCw } from "lucide-react";
import { monthLabel, timelinePointerPosition, type PhotoMonth } from "./lib/gallery";

export default function PhotoTimeline({ months, active, fallback, loading, error, retry, jump, scrolling }: {
  months: PhotoMonth[];
  active: number;
  fallback: string;
  loading: boolean;
  error: string;
  retry: () => void;
  jump: (index: number) => void;
  scrolling: boolean;
}) {
  const pointer = useRef<number | null>(null);
  const lastJump = useRef(-1);
  const [position, setPosition] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [released, setReleased] = useState(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = months[active];
  const available = !loading && !error && months.length > 0;
  const expanded = position !== null || keyboard;
  const fraction = position ?? (months.length > 1 ? active / (months.length - 1) : 0);
  const label = loading ? "연표 준비 중" : error ? "연표 연결 확인" : current ? monthLabel(current.month) : fallback;

  useEffect(() => {
    if (!available) {
      pointer.current = null;
      setPosition(null);
    }
  }, [available]);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);

  const finish = () => {
    pointer.current = null;
    setPosition(null);
    setReleased(true);
    clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setReleased(false), 1100);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!available) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = timelinePointerPosition(event.clientY, bounds.top, bounds.height, months.length);
    setPosition(target.fraction);
    if (lastJump.current !== target.index) {
      lastJump.current = target.index;
      jump(target.index);
    }
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    finish();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <aside className={`photo-timeline${scrolling || expanded || released ? " is-visible" : ""}`}
      aria-label="사진 연표">
      <div
        className={`timeline-rail${expanded ? " is-expanded" : ""}${keyboard ? " is-keyboard" : ""}`}
        style={{ "--timeline-position": fraction } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label="사진 연표, 위아래로 드래그하여 촬영 시점 이동"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, months.length - 1)}
        aria-valuenow={Math.min(active, Math.max(0, months.length - 1))}
        aria-valuetext={label}
        aria-disabled={!available}
        onFocus={(event) => setKeyboard(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setKeyboard(false)}
        onPointerDown={(event) => {
          if (!available || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          setKeyboard(false);
          pointer.current = event.pointerId;
          lastJump.current = -1;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={(event) => { if (pointer.current === event.pointerId) move(event); }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={() => { if (pointer.current !== null) finish(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setKeyboard(false); return; }
          if (!available) return;
          const next = event.key === "Home" ? 0 : event.key === "End" ? months.length - 1
            : event.key === "ArrowDown" || event.key === "ArrowRight" ? active + 1
            : event.key === "ArrowUp" || event.key === "ArrowLeft" ? active - 1
            : event.key === "PageDown" ? active + 12 : event.key === "PageUp" ? active - 12 : null;
          if (next === null) return;
          event.preventDefault();
          setKeyboard(true);
          jump(Math.max(0, Math.min(months.length - 1, next)));
        }}
      >
        <span className="timeline-thumb" aria-hidden="true" />
        <span className="timeline-callout" aria-hidden="true">{label}</span>
      </div>
      {error && !loading && <button className="timeline-retry" aria-label="연표 다시 불러오기"
        title={error} onClick={retry}
        onFocus={(event) => setKeyboard(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setKeyboard(false)}><RefreshCw size={16} /></button>}
    </aside>
  );
}
