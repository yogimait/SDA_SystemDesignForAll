"use client";

/**
 * Shared diagram viewport logic (F4): wheel-anchored zoom, drag pan, fit,
 * keyboard zoom keys. Extracted from DiagramCanvas so the LLD and HLD
 * canvases render differently but interact identically.
 * Renderers attach `backgroundHandlers` to their background <rect> and
 * `onKeyDown` to the focused wrapper div.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ViewportTransform = { x: number; y: number; k: number };

const MIN_K = 0.15;
const MAX_K = 3;

function clampK(value: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, value));
}

export function useDiagramViewport(
  scene: { width: number; height: number },
  onClear: () => void,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
  const userAdjusted = useRef(false);
  const panState = useRef<{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (el === null || scene.width === 0 || scene.height === 0) return;
    const rect = el.getBoundingClientRect();
    const k = clampK(Math.min(rect.width / scene.width, rect.height / scene.height) * 0.95);
    setTransform({ k, x: (rect.width - scene.width * k) / 2, y: (rect.height - scene.height * k) / 2 });
  }, [scene.width, scene.height]);

  // Fit on mount, on scene change (new diagram), and on container resize until
  // the user zooms/pans manually.
  useEffect(() => {
    fit();
    userAdjusted.current = false;
  }, [fit, scene]);

  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      if (!userAdjusted.current) fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // Print layout differs from the screen box (export diagrams print on a
  // landscape page); refit so the drawing fills the paper, then refit again
  // when print media ends so the on-screen preview is not left clipped.
  useEffect(() => {
    const refit = () => fit();
    window.addEventListener("beforeprint", refit);
    window.addEventListener("afterprint", refit);
    return () => {
      window.removeEventListener("beforeprint", refit);
      window.removeEventListener("afterprint", refit);
    };
  }, [fit]);

  // Wheel-zoom anchored at the cursor; non-passive so preventDefault sticks.
  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userAdjusted.current = true;
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * 0.0015);
      setTransform((t) => {
        const k = clampK(t.k * factor);
        const s = k / t.k;
        return { k, x: px - (px - t.x) * s, y: py - (py - t.y) * s };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    userAdjusted.current = true;
    setTransform((t) => {
      const k = clampK(t.k * factor);
      const s = k / t.k;
      return { k, x: t.x * s, y: t.y * s };
    });
  }, []);

  /** True when the OS asks for reduced motion (no tweened fit). */
  function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * Fit the viewport to a scene-space bounding box (guided-mode step change).
   * Animates briefly unless reduced motion is on, and marks the viewport as
   * user-adjusted so scene-level refits don't fight the guided reveal.
   */
  const fitToBox = useCallback((box: { x: number; y: number; width: number; height: number }) => {
    const el = wrapRef.current;
    if (el === null || box.width <= 0 || box.height <= 0) return;
    const rect = el.getBoundingClientRect();
    const k = clampK(Math.min(rect.width / box.width, rect.height / box.height) * 0.88);
    const next: ViewportTransform = {
      k,
      x: (rect.width - box.width * k) / 2 - box.x * k,
      y: (rect.height - box.height * k) / 2 - box.y * k,
    };
    userAdjusted.current = true;
    if (prefersReducedMotion()) {
      setTransform(next);
      return;
    }
    const start = performance.now();
    const duration = 280;
    setTransform((current) => {
      const from = { ...current };
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (2 * t - 2) / 2; // easeInOutQuad
        setTransform({
          k: from.k + (next.k - from.k) * eased,
          x: from.x + (next.x - from.x) * eased,
          y: from.y + (next.y - from.y) * eased,
        });
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return current; // first commit keeps current; RAF drives the tween
    });
  }, []);

  function onBackgroundPointerDown(event: React.PointerEvent<SVGRectElement>) {
    if (event.button !== 0) return;
    panState.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    userAdjusted.current = true;
  }

  function onBackgroundPointerMove(event: React.PointerEvent<SVGRectElement>) {
    const state = panState.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    if (state.moved === false && Math.abs(dx) + Math.abs(dy) < 3) return;
    state.moved = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }

  function onBackgroundPointerUp() {
    const state = panState.current;
    panState.current = null;
    if (state !== null && state.moved === false) {
      onClear(); // plain click on empty canvas clears the selection
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.25);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomBy(0.8);
    } else if (event.key === "0") {
      event.preventDefault();
      fit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClear();
    }
  }

  return {
    wrapRef,
    transform,
    fit,
    fitToBox,
    zoomBy,
    zoomPercent: Math.round(transform.k * 100),
    backgroundHandlers: {
      onPointerDown: onBackgroundPointerDown,
      onPointerMove: onBackgroundPointerMove,
      onPointerUp: onBackgroundPointerUp,
      onPointerCancel: () => {
        panState.current = null;
      },
    },
    onKeyDown,
  };
}
