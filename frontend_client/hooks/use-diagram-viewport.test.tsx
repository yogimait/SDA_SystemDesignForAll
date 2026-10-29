import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramViewport } from "./use-diagram-viewport";

const SCENE = { width: 800, height: 500 };

type Api = ReturnType<typeof useDiagramViewport>;

let observers: Array<() => void> = [];

function Harness({ apiRef }: { apiRef: { current: Api | null } }) {
  const api = useDiagramViewport(SCENE, () => undefined);
  useEffect(() => {
    apiRef.current = api;
  }, [api, apiRef]);
  // eslint-disable-next-line react-hooks/refs -- the hook owns this ref; the harness only attaches it
  return <div ref={api.wrapRef} />;
}

function setRect(element: HTMLElement, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
}

describe("useDiagramViewport resize behaviour", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly callback: () => void;
        constructor(callback: () => void) {
          this.callback = callback;
        }
        observe(): void {
          observers.push(this.callback);
        }
        disconnect(): void {}
      },
    );
    // Reduced motion: guided fits apply immediately (no RAF tween in jsdom).
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refits the scene after a guided fit when the container resizes", () => {
    const apiRef: { current: Api | null } = { current: null };
    const { container } = render(<Harness apiRef={apiRef} />);
    const element = container.firstElementChild as HTMLDivElement;
    setRect(element, 1200, 700);

    act(() => apiRef.current!.fit());
    const fitted = apiRef.current!.transform.k;
    expect(fitted).toBeCloseTo(Math.min(1200 / SCENE.width, 700 / SCENE.height) * 0.95, 3);

    // Guided mode zooms into a fraction of the scene.
    act(() => apiRef.current!.fitToBox({ x: 100, y: 50, width: 400, height: 250 }));
    const guided = apiRef.current!.transform.k;
    expect(guided).toBeGreaterThan(fitted);

    // Crossing to a phone-width container refits — the diagram is never
    // left offscreen because guided mode "adjusted" the viewport.
    setRect(element, 390, 600);
    act(() => observers.forEach((notify) => notify()));
    expect(apiRef.current!.transform.k).toBeCloseTo(Math.min(390 / SCENE.width, 600 / SCENE.height) * 0.95, 3);
  });

  it("does not fight a deliberate zoom on resize", () => {
    const apiRef: { current: Api | null } = { current: null };
    const { container } = render(<Harness apiRef={apiRef} />);
    const element = container.firstElementChild as HTMLDivElement;
    setRect(element, 1200, 700);

    act(() => apiRef.current!.fit());
    act(() => apiRef.current!.zoomBy(1.5));
    const zoomed = apiRef.current!.transform.k;

    setRect(element, 390, 600);
    act(() => observers.forEach((notify) => notify()));
    expect(apiRef.current!.transform.k).toBe(zoomed);
  });
});
