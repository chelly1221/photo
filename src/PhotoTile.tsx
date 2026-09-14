import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import type { Photo } from "./lib/api";

export default function PhotoTile({ photo, onLongPress, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  photo: Photo; onLongPress?: (photo: Photo) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const cancel = () => { clearTimeout(timer.current); origin.current = null; };
  useEffect(() => {
    const interrupt = () => cancel();
    const multiple = (event: PointerEvent) => { if (!event.isPrimary) cancel(); };
    document.addEventListener("scroll", interrupt, true);
    document.addEventListener("pointerdown", multiple, true);
    return () => { cancel(); document.removeEventListener("scroll", interrupt, true); document.removeEventListener("pointerdown", multiple, true); };
  }, []);
  return <button {...props}
    onPointerDown={event => {
      held.current = false;
      cancel();
      if (!onLongPress || !event.isPrimary || event.button !== 0) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { held.current = true; origin.current = null; onLongPress(photo); }, 500);
    }}
    onPointerMove={event => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) cancel();
    }}
    onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
    onClick={event => { if (held.current) { held.current = false; event.preventDefault(); return; } props.onClick?.(event); }}
    onContextMenu={event => { if (onLongPress) { event.preventDefault(); cancel(); held.current = true; onLongPress(photo); } }}
    onKeyDown={event => {
      if (onLongPress && (event.key === "Delete" || event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
        event.preventDefault(); cancel(); onLongPress(photo);
      } else props.onKeyDown?.(event);
    }}
  />;
}
