import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { galleryAnchor, galleryAnchorTop, pinchColumns, type GalleryAnchor } from "./lib/gallery";

type Layout = { width: number; height: number; columns: number; total: number };
type Gesture = { ids: number[]; distance: number; columns: number; anchor: GalleryAnchor };

export function useGalleryPinch(container: RefObject<HTMLDivElement | null>, layout: Layout,
  changeColumns: (columns: number) => void, changeScroll: (top: number) => void) {
  const latest = useRef({ layout, changeColumns, changeScroll });
  const previous = useRef(layout);
  const lastScroll = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const pending = useRef<GalleryAnchor | null>(null);
  const suppressUntil = useRef(0);
  const [active, setActive] = useState(false);
  const [hint, setHint] = useState(false);

  useLayoutEffect(() => {
    latest.current = { layout, changeColumns, changeScroll };
    const element = container.current;
    const old = previous.current;
    if (element && (old.columns !== layout.columns || old.width !== layout.width)) {
      // The toolbar and resizing preserve the top visible photo too.
      const anchor = pending.current ?? galleryAnchor(old.width, old.columns, lastScroll.current, 0, 0, old.total);
      element.scrollTop = galleryAnchorTop(anchor, layout.width, layout.columns, layout.height, layout.total);
      lastScroll.current = element.scrollTop;
      changeScroll(element.scrollTop);
      pending.current = null;
    }
    previous.current = layout;
  });

  useEffect(() => {
    if (active) return;
    const timer = setTimeout(() => setHint(false), 950);
    return () => clearTimeout(timer);
  }, [active, layout.columns]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let blocked = false;
    const scroll = () => { lastScroll.current = element.scrollTop; };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2 || blocked) return;
      const [a, b] = Array.from(event.touches);
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (distance < 12) return;
      if (event.cancelable) event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = latest.current.layout;
      gesture.current = {
        ids: [a.identifier, b.identifier], distance, columns: current.columns,
        anchor: galleryAnchor(current.width, current.columns, element.scrollTop,
          (a.clientX + b.clientX) / 2 - rect.left, (a.clientY + b.clientY) / 2 - rect.top, current.total),
      };
      blocked = true;
      suppressUntil.current = Infinity;
      setActive(true);
      setHint(true);
    };
    const move = (event: TouchEvent) => {
      if (!blocked) return;
      if (event.cancelable) event.preventDefault();
      const current = gesture.current;
      if (!current || event.touches.length !== 2) return;
      const touches = Array.from(event.touches);
      const a = touches.find((touch) => touch.identifier === current.ids[0]);
      const b = touches.find((touch) => touch.identifier === current.ids[1]);
      if (!a || !b) return;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = pinchColumns(current.columns, distance / current.distance, latest.current.layout.columns);
      if (next !== latest.current.layout.columns) {
        pending.current = { ...current.anchor, y: (a.clientY + b.clientY) / 2 - element.getBoundingClientRect().top };
        latest.current.changeColumns(next);
      }
    };
    const end = (event: TouchEvent) => {
      if (!blocked) return;
      // Lifting one finger must not become a photo tap or a new one-finger pan.
      if (event.cancelable) event.preventDefault();
      if (event.touches.length < 2) gesture.current = null;
      if (event.touches.length === 0 || event.type === "touchcancel") {
        blocked = false;
        gesture.current = null;
        suppressUntil.current = performance.now() + 400;
        setActive(false);
      }
    };
    const click = (event: MouseEvent) => {
      if (event.detail !== 0 && performance.now() < suppressUntil.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    element.addEventListener("scroll", scroll, { passive: true });
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", end, { passive: false });
    element.addEventListener("click", click, true);
    return () => {
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
      element.removeEventListener("click", click, true);
    };
  }, [container]);

  return { active, hint };
}
