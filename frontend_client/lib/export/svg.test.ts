import { beforeEach, describe, expect, it } from "vitest";
import { serializeSvg, svgFilename } from "./svg";

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 480");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("aria-label", "UML class diagram");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  svg.appendChild(defs);

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("transform", "translate(10, 20)");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("style", "fill:oklch(1 0 0)");
  rect.setAttribute("x", "5");
  rect.setAttribute("y", "6");
  rect.setAttribute("width", "100");
  rect.setAttribute("height", "40");

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("marker-end", "url(#marker-association)");
  text.textContent = "Limiter";

  group.appendChild(rect);
  group.appendChild(text);
  svg.appendChild(group);
  return svg;
}

describe("serializeSvg", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits a standalone document sized from the viewBox", () => {
    const out = serializeSvg(makeSvg());
    expect(out.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>")).toBe(true);
    expect(out).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(out).toContain("width=\"640\"");
    expect(out).toContain("height=\"480\"");
    // interaction chrome is gone, drawing attributes survive
    expect(out).not.toContain("tabindex");
    expect(out).toContain("translate(10, 20)");
    expect(out).toContain("marker-end");
    expect(out).toContain("Limiter");
    // defs remain (markers reference them) but titles/descs are kept as-is
    expect(out).toContain("defs");
  });

  it("preserves author inline styles even when computed styles are empty", () => {
    const out = serializeSvg(makeSvg());
    expect(out).toContain("fill:oklch(1 0 0)");
  });

  it("does not mutate the live element", () => {
    const live = makeSvg();
    serializeSvg(live);
    expect(live.getAttribute("tabindex")).toBe("0");
    expect(live.getAttribute("width")).toBe("100%");
  });
});

describe("svgFilename", () => {
  it("slugifies titles and appends the suffix", () => {
    expect(svgFilename("Rate Limiter!", "lld")).toBe("rate-limiter-lld.svg");
    expect(svgFilename("   ", "hld")).toBe("architecture-hld.svg");
    expect(svgFilename("a".repeat(120), "lld")).toBe(`${"a".repeat(60)}-lld.svg`);
  });
});
