/**
 * Standalone SVG serialization for the export route's "Download SVG" action:
 * clone the live diagram SVG, inline the computed styles the drawing depends
 * on (the export page renders inside the light `.export-doc` scope, so the
 * computed values are already print-colored), strip interaction attributes,
 * and emit a self-contained document.
 */

const INLINE_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
  "marker-start",
  "marker-mid",
  "marker-end",
  "visibility",
] as const;

const STRIP_ATTRIBUTES = ["tabindex", "data-slot", "aria-hidden"];

/** Elements whose computed styles never reach the visible paint. */
function isRenderable(el: Element): boolean {
  return !(el.tagName === "defs" || el.tagName === "title" || el.tagName === "desc");
}

function inlineStyles(
  source: Element,
  target: Element,
  view: { getComputedStyle: (el: Element) => CSSStyleDeclaration },
): void {
  if (!isRenderable(source) || typeof view.getComputedStyle !== "function") return;
  const computed = view.getComputedStyle(source);
  const declarations: string[] = [];
  for (const prop of INLINE_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop).trim();
    // "none" counts (fill/stroke none is meaningful); empty means unresolved.
    if (value !== "") declarations.push(`${prop}:${value}`);
  }
  // Always carry any author-set inline style (labels set fill-* classes that
  // resolve through computed styles; explicit inline wins in either case).
  const inline = source.getAttribute("style");
  if (inline) declarations.push(inline);
  if (declarations.length > 0) target.setAttribute("style", declarations.join(";"));

  for (const attr of STRIP_ATTRIBUTES) target.removeAttribute(attr);

  const children = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const targetChild = targetChildren[i];
    if (child && targetChild) inlineStyles(child, targetChild, view);
  }
}

/** Serializes a live <svg> into a standalone document string. `size` is the
 * scene's own dimensions — the live SVG carries the fitted pan/zoom transform,
 * and a downloaded file must instead be the untransformed scene at full
 * resolution. */
export function serializeSvg(
  svg: SVGSVGElement,
  size?: { width: number; height: number },
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone, window);

  // Drop the viewport transform so the scene paints at its native scale.
  const root = clone.querySelector("[data-diagram-root]");
  if (root !== null) {
    root.removeAttribute("transform");
    root.removeAttribute("data-diagram-root");
  }

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("tabindex");

  const box = size ?? viewBoxSize(svg);
  if (box !== null) {
    clone.setAttribute("viewBox", `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
    clone.setAttribute("width", String(Math.round(box.width)));
    clone.setAttribute("height", String(Math.round(box.height)));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** viewBox attribute as {width,height} — SVGAnimatedRect is unavailable in jsdom. */
function viewBoxSize(svg: SVGSVGElement): { width: number; height: number } | null {
  const parts = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = parts[2];
  const height = parts[3];
  return width !== undefined &&
    height !== undefined &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
}

/** Triggers a browser download of the serialized SVG under a readable name. */
export function downloadSvg(
  filename: string,
  svg: SVGSVGElement,
  size?: { width: number; height: number },
): void {
  const blob = new Blob([serializeSvg(svg, size)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Slug for filenames: title → filesystem-safe stem. */
export function svgFilename(title: string, suffix: string): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${stem === "" ? "architecture" : stem}-${suffix}.svg`;
}
