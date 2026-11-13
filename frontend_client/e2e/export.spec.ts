/**
 * Export route smoke: the canonical model renders as a printable document,
 * print media hides app chrome and keeps the document, per-diagram SVG
 * download produces a file, and the missing/invalid model paths show error
 * cards — never a blank print sheet. Includes the browser-print PDF smoke
 * (non-empty A4 buffer) and the `?next=` sign-in round-trip check.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fillAuthForm, mockAuthRoutes } from "./helpers";

const USER = {
  id: "usr_export01",
  email: "export@example.com",
  planTier: "pro",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const AUTH_SEED = `
  window.sessionStorage.setItem("sda:auth:user", JSON.stringify({ user: ${JSON.stringify(USER)} }));
`;

const PROJECT = {
  id: "proj_1",
  idea: "Design a sliding-window rate limiter for a public API.",
  ownerId: USER.id,
  status: "architecture_ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  currentArchitectureVersion: 1,
};

const MODEL = {
  meta: { title: "Rate Limiter", summary: "Sliding-window limiter at the gateway." },
  requirements: {
    confirmedAt: "2026-01-05T00:00:00.000Z",
    spec: {
      functional: [{ id: "fr_1", kind: "functional", text: "Clients can submit ideas", priority: "must" }],
      nonFunctional: [
        {
          id: "nfr_1",
          kind: "nonfunctional",
          text: "Respond under 200ms",
          priority: "should",
          category: "performance",
          target: "p95 < 200ms",
        },
      ],
      assumptions: [{ id: "asm_1", text: "Single region deployment" }],
      clarifications: [{ id: "q_1", question: "Which cloud?", answer: "AWS" }],
    },
  },
  hld: {
    components: [
      { id: "cmp_1", name: "Gateway", type: "gateway", responsibility: "Accepts and checks calls", technology: "nginx", requirementRefs: ["fr_1"], scalingNotes: "" },
    ],
    connections: [
      { id: "conn_1", fromComponentId: "cmp_1", toComponentId: "cmp_1", kind: "sync", label: "check limit", protocol: "http", rationale: "Inline check keeps latency low." },
    ],
    flows: [
      { id: "flow_1", name: "Check limit", description: "Client hits the gateway.", steps: [{ order: 1, description: "gateway checks", elementRefs: ["cmp_1"] }], requirementRefs: [] },
    ],
    technologyDecisions: [],
    scalabilityNotes: [],
    failureScenarios: [],
  },
  lld: {
    classes: [
      {
        id: "cls_1",
        name: "RateLimiter",
        kind: "class",
        responsibility: "Tracks sliding windows per key.",
        requirementRefs: ["fr_1"],
        rationale: "Keeps window math in one place.",
        alternatives: [],
        invariants: [],
        attributes: [{ name: "windowSeconds", type: "number", visibility: "private", static: false, description: "" }],
        methods: [{ name: "allow", signature: "allow(key: string): boolean", visibility: "public", description: "" }],
      },
      {
        id: "cls_2",
        name: "WindowStore",
        kind: "class",
        responsibility: "Persists window counters.",
        requirementRefs: [],
        rationale: "Keeps storage concerns separate.",
        alternatives: [],
        invariants: [],
        attributes: [],
        methods: [],
      },
      {
        id: "cls_3",
        name: "KeyIndex",
        kind: "class",
        responsibility: "Maps keys to buckets.",
        requirementRefs: [],
        rationale: "Fast key lookup.",
        alternatives: [],
        invariants: [],
        attributes: [],
        methods: [],
      },
      {
        id: "cls_4",
        name: "Clock",
        kind: "interface",
        responsibility: "Supplies the current time.",
        requirementRefs: [],
        rationale: "Makes time testable.",
        alternatives: [],
        invariants: [],
        attributes: [],
        methods: [],
      },
    ],
    relationships: [
      { id: "rel_1", kind: "association", sourceId: "cls_1", targetId: "cls_1", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "", rationale: "Key maps to counters." },
      { id: "rel_2", kind: "composition", sourceId: "cls_1", targetId: "cls_2", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "owns", rationale: "The limiter owns its store." },
      { id: "rel_3", kind: "association", sourceId: "cls_1", targetId: "cls_3", sourceMultiplicity: "1", targetMultiplicity: "1", label: "indexes", rationale: "Keys resolve through the index." },
      { id: "rel_4", kind: "dependency", sourceId: "cls_1", targetId: "cls_4", sourceMultiplicity: "0..*", targetMultiplicity: "1", label: "reads", rationale: "Window math needs time." },
    ],
    patterns: [],
  },
  dsa: {
    recommendations: [
      {
        id: "dsa_1",
        operation: "check rate limit",
        layer: "lld",
        dataStructure: "ring buffer",
        algorithm: "sliding window counter",
        complexity: { average: "O(1)", worst: "O(1)", notes: "Fixed bucket count." },
        rationale: "Constant memory per key.",
        requirementRefs: [],
        assumptions: [],
        alternatives: [],
        limitations: [],
      },
    ],
    algorithmicPatterns: [],
  },
  learningSteps: [
    { id: "step_1", title: "Window math", explanation: "Buckets roll every second.", elementRefs: ["cls_1"] },
  ],
};

const ARCH = {
  version: {
    id: "ver_1",
    projectId: "proj_1",
    version: 1,
    createdAt: "2026-02-01T10:00:00.000Z",
    model: MODEL,
    validation: {
      valid: true,
      errors: [],
      warnings: [
        { rule: "unreferenced_must_requirement", severity: "warning", message: "One requirement is not referenced.", path: "fr_2" },
      ],
      validatedAt: "2026-02-01T10:00:01.000Z",
    },
  },
};

const envelope = (data: unknown, code = 200) => ({ status: true, statusCode: code, data });

/** Two components + a connection-driven flow, with one step that cannot resolve. */
const SEQUENCE_ARCH = {
  version: {
    ...ARCH.version,
    model: {
      ...MODEL,
      hld: {
        ...MODEL.hld,
        components: [
          ...MODEL.hld.components,
          {
            id: "cmp_2",
            name: "Cache",
            type: "cache",
            responsibility: "Stores window counters",
            technology: "Redis",
            requirementRefs: [],
            scalingNotes: "",
          },
        ],
        connections: [
          ...MODEL.hld.connections,
          {
            id: "conn_2",
            fromComponentId: "cmp_1",
            toComponentId: "cmp_2",
            kind: "sync",
            label: "lookup",
            protocol: "http",
            rationale: "Read-through lookup.",
          },
        ],
        flows: [
          {
            id: "flow_2",
            name: "Read through",
            description: "Gateway reads the cache before counting.",
            steps: [
              // Deliberately out of order: the scene sorts by contract order.
              { order: 2, description: "cache counts the window", elementRefs: ["cmp_2"] },
              { order: 1, description: "gateway looks up the cache", elementRefs: ["conn_2"] },
              { order: 3, description: "orphan hop", elementRefs: ["cmp_999"] },
            ],
            requirementRefs: [],
          },
        ],
      },
    },
  },
};

/** Same model, but every flow step references unknown ids. */
const NO_SEQUENCE_ARCH = {
  version: {
    ...ARCH.version,
    model: {
      ...MODEL,
      hld: {
        ...MODEL.hld,
        flows: [
          {
            id: "flow_3",
            name: "Ghost flow",
            description: "Nothing in this flow resolves.",
            steps: [{ order: 1, description: "nowhere", elementRefs: ["cmp_999", "conn_999"] }],
            requirementRefs: [],
          },
        ],
      },
    },
  },
};

/** Two participants, twenty steps — the long-flow print-scaling fixture. */
const LONG_FLOW_ARCH = {
  version: {
    ...ARCH.version,
    model: {
      ...MODEL,
      hld: {
        ...MODEL.hld,
        components: [
          ...MODEL.hld.components,
          {
            id: "cmp_2",
            name: "Cache",
            type: "cache",
            responsibility: "Stores window counters",
            technology: "Redis",
            requirementRefs: [],
            scalingNotes: "",
          },
        ],
        connections: [
          ...MODEL.hld.connections,
          {
            id: "conn_2",
            fromComponentId: "cmp_1",
            toComponentId: "cmp_2",
            kind: "sync",
            label: "lookup",
            protocol: "http",
            rationale: "Read-through lookup.",
          },
        ],
        flows: [
          {
            id: "flow_long",
            name: "Long walk",
            description: "Twenty ordered steps through the pair.",
            steps: Array.from({ length: 20 }, (_, index) => ({
              order: index + 1,
              description: `step ${index + 1} walks the pair`,
              elementRefs: index % 2 === 0 ? ["conn_2"] : ["cmp_2"],
            })),
            requirementRefs: [],
          },
        ],
      },
    },
  },
};

function interceptExport(page: Page, overrides: { arch?: unknown } = {}): void {
  page.route("**/api/projects/proj_1/architecture", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(overrides.arch ?? ARCH)),
    }),
  );
  page.route("**/api/projects/proj_1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(PROJECT)),
    }),
  );
  mockAuthRoutes(page, USER);
}

test("export renders the document, prints light, and hides app chrome", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");

  // Document sections, all from contract fields.
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Requirements" })).toBeVisible();
  await expect(page.getByText("Respond under 200ms")).toBeVisible();
  await expect(page.getByRole("region", { name: "High-level design" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Low-level design" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Data structures and algorithms" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Learning steps" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Validation notes" })).toBeVisible();
  await expect(page.getByText("One requirement is not referenced.")).toBeVisible();
  // Back to the workspace resolves the route id (not a params-promise cast).
  await expect(page.getByRole("link", { name: "Back to workspace" })).toHaveAttribute(
    "href",
    "/projects/proj_1/workspace",
  );
  await expect(page.getByText(/Download an SVG in each design section/)).toBeVisible();
  // Raw contract ids never print (fr_/nfr_/q_/asm_/step_ refs are UI keys only).
  await expect(page.getByText(/fr_/)).toHaveCount(0);
  await expect(page.getByText(/nfr_/)).toHaveCount(0);
  await expect(page.getByText(/asm_/)).toHaveCount(0);
  // Visual evidence: the document paints light on its own paper.
  await page.screenshot({ path: "test-results/export-light-check.png", fullPage: true });
});

test("document stays overflow-free across breakpoints", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  for (const width of [1440, 1280, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `export overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
    await expect(page.getByRole("link", { name: "Back to workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
  }
});

test("print media hides chrome and every diagram fits one landscape page", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  // App chrome (.no-print) is gone in print; the document remains.
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Low-level design" })).toBeVisible();
  // Canvas zoom controls are interaction chrome, never printed.
  await expect(page.getByLabel("Zoom in").first()).toBeHidden();

  // Each diagram section must fit the landscape A4 printable height, else the
  // browser splits it onto a second page and clips the drawing (QA D1).
  const printableMm = await page.evaluate(() => {
    const pxPerMm = 96 / 25.4;
    return Array.from(document.querySelectorAll(".export-diagram-page")).map(
      (section) => section.getBoundingClientRect().height / pxPerMm,
    );
  });
  expect(printableMm).toHaveLength(2);
  for (const heightMm of printableMm) {
    // A4 landscape 210mm minus 2 × 10mm page margin = 190mm.
    expect(heightMm).toBeLessThanOrEqual(190);
  }

  // `preferCSSPageSize` uses the named @page sizes (portrait document pages,
  // landscape diagram pages).
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(1_000);
  expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const raw = pdf.toString("latin1");
  const boxes = [...raw.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((match) =>
    match[1].split(/\s+/).map(Number),
  );
  const landscape = boxes.filter((box) => (box[2] ?? 0) > (box[3] ?? 0));
  // Exactly the two diagram pages, one page each — no split, no clipping.
  expect(landscape).toHaveLength(2);
  expect(boxes.length).toBeGreaterThan(landscape.length);
  const out = path.join("test-results", "export-smoke.pdf");
  fs.writeFileSync(out, pdf);
  await page.emulateMedia({ media: "screen" });
});

test("relationship rows name both classes; export diagrams fit the printable aspect", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  // A. Relationship rows resolve endpoint class names; raw cls_ ids never print.
  const row = page
    .getByRole("region", { name: "Classes and patterns" })
    .locator("li")
    .filter({ hasText: "RateLimiter → WindowStore" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("composition · 1 → 0..*");
  await expect(page.getByText(/cls_/)).toHaveCount(0);

  // B. Export-specific orientation: each diagram publishes the rank direction
  // whose scene aspect fits the landscape A4 box (~1.5). The LLD star fixture
  // must flip away from the workspace default (BT → LR).
  const hldBox = page
    .getByRole("region", { name: "High-level design" })
    .locator(".export-diagram");
  const lldBox = page
    .getByRole("region", { name: "Low-level design" })
    .locator(".export-diagram");
  await expect(lldBox).toHaveAttribute("data-rankdir", "LR");
  expect(["LR", "TB"]).toContain(await hldBox.getAttribute("data-rankdir"));
  for (const box of [hldBox, lldBox]) {
    const size = await box.getAttribute("data-scene");
    expect(size).toMatch(/^\d+x\d+$/);
    const [width, height] = (size as string).split("x").map(Number);
    // Chosen aspect within 1.0 of the printable box aspect (1.5).
    expect(Math.abs(width / height - 1.5)).toBeLessThanOrEqual(1.0);
  }

  // C. Print guidance sits next to the Print button (browser dialog settings
  // cannot be controlled from the page — the user must pick them).
  await expect(page.getByText(/enable background graphics/)).toBeVisible();
  await expect(page.getByText(/set Orientation to Landscape/)).toBeVisible();
});

test("sequence diagrams render per flow with participants and step badges", async ({ page }) => {
  interceptExport(page, { arch: SEQUENCE_ARCH });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  const region = page.getByRole("region", { name: "Sequence diagrams" });
  await expect(region).toBeVisible();
  await expect(region.getByRole("heading", { name: "Read through" })).toBeVisible();
  await expect(region.getByText("Gateway reads the cache before counting.")).toBeVisible();

  // Participant header boxes, ordered by first appearance in step order
  // (step 1's connection ref registers Gateway before Cache).
  const participants = region.locator(".seq-participant");
  await expect(participants).toHaveCount(2);
  await expect(participants.nth(0)).toContainText("Gateway");
  await expect(participants.nth(1)).toContainText("Cache");

  // Step badges: orders 1 and 2 render; the unresolvable step 3 is skipped.
  const badges = region.locator(".seq-step-badge");
  await expect(badges).toHaveCount(2);
  await expect(badges.nth(0)).toContainText("1");
  await expect(badges.nth(1)).toContainText("2");
  await expect(region.getByText(/2 of 3 steps/)).toBeVisible();

  // Full step text as an ordered list (SVG labels truncate; role="img"
  // children are presentational) — direction from the resolved endpoints.
  await expect(
    region.getByText("1. Gateway -> Cache: gateway looks up the cache"),
  ).toBeVisible();
  await expect(
    region.getByText("2. Cache -> Cache: cache counts the window"),
  ).toBeVisible();

  // Raw contract ids never print.
  await expect(page.getByText(/cmp_/)).toHaveCount(0);
  await expect(page.getByText(/conn_/)).toHaveCount(0);
  await expect(page.getByText(/flow_/)).toHaveCount(0);
});

test("sequence section is omitted when no flow step resolves", async ({ page }) => {
  interceptExport(page, { arch: NO_SEQUENCE_ARCH });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  await expect(page.getByRole("region", { name: "Sequence diagrams" })).toHaveCount(0);
  // The prose flow list still describes the flow — only the diagram hides.
  await expect(page.getByText("Ghost flow")).toBeVisible();
});

test("long sequence flows scale down to fit the portrait printable page", async ({ page }) => {
  interceptExport(page, { arch: LONG_FLOW_ARCH });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("region", { name: "Sequence diagrams" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const measured = await page.evaluate(() => {
    const pxPerMm = 96 / 25.4;
    const section = document.querySelector(".export-sequence-section");
    const figure = document.querySelector<HTMLElement>(".export-sequence");
    const svg = figure?.querySelector("svg") ?? null;
    return {
      sectionBreak: section === null ? "missing" : getComputedStyle(section).breakInside,
      figureBreak: figure === null ? "missing" : getComputedStyle(figure).breakInside,
      figureMm: figure === null ? Infinity : figure.getBoundingClientRect().height / pxPerMm,
      svgMm: svg === null ? Infinity : svg.getBoundingClientRect().height / pxPerMm,
    };
  });
  // The 20-step scene is 856px (226mm) at native size and was 381mm when
  // upscaled to the 640px column: print caps the SVG at 170mm, leaving the
  // heading + caption inside one unbreakable figure on a 297 - 24 = 273mm
  // A4 portrait page. The full step list lives outside the figure so it can
  // paginate as text.
  expect(measured.svgMm).toBeLessThanOrEqual(170.5);
  expect(measured.figureMm).toBeLessThanOrEqual(273);
  // The section paginates between figures; each figure stays whole.
  expect(measured.sectionBreak).toBe("auto");
  expect(measured.figureBreak).toBe("avoid");
  await page.emulateMedia({ media: "screen" });
});

test("per-diagram Download SVG emits a standalone file", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");

  const hldRegion = page.getByRole("region", { name: "High-level design" });
  await expect(hldRegion).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    hldRegion.getByRole("button", { name: "SVG" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("rate-limiter-hld.svg");
  const file = await download.path();
  expect(file).not.toBeNull();
  const content = fs.readFileSync(file as string, "utf8");
  expect(content).toContain("<?xml");
  expect(content).toContain("http://www.w3.org/2000/svg");
  expect(content).toContain("marker-end");
  // Full resolution: the fitted on-screen transform is stripped.
  expect(content).toMatch(/viewBox="0 0 \d+ \d+"/);
  expect(content).not.toContain("data-diagram-root");
});

test("missing architecture shows an error card, never a blank sheet", async ({ page }) => {
  interceptExport(page, { arch: { version: null } });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByText("There is no architecture to export yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toHaveCount(0);
});

test("invalid model blocks the export with an error card", async ({ page }) => {
  interceptExport(page, {
    arch: {
      version: {
        ...ARCH.version,
        validation: {
          valid: false,
          errors: [{ rule: "orphan_class", severity: "error", message: "Class without relationships." }],
          warnings: [],
          validatedAt: "t",
        },
      },
    },
  });
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByText("The model failed validation. Export blocked.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toHaveCount(0);
});

test("signed-out visitors get the access card with a sign-in path", async ({ page }) => {
  interceptExport(page);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByText("This export needs project access.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("?next= round-trip: signing in returns to the requested page", async ({ page }) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          user: USER,
          accessToken: "token_export_001",
          tokenType: "Bearer",
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        }),
      ),
    }),
  );
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          range: "last_30_days",
          generatedAt: "t",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, runCount: 0, projectCount: 0 },
          buckets: [],
          topModels: [],
          recentRuns: [],
        }),
      ),
    }),
  );

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);

  await fillAuthForm(page, "export@example.com", "Supersecret1!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("HLD + LLD only print emits exactly the two landscape pages", async ({ page }) => {
  interceptExport(page);
  await page.addInitScript(AUTH_SEED);
  await page.goto("/projects/proj_1/export");
  await expect(page.getByRole("heading", { name: "Rate Limiter" })).toBeVisible();

  await page.getByRole("button", { name: "HLD + LLD only", exact: true }).click();
  await expect(page.locator("article.export-doc")).toHaveAttribute(
    "data-print-scope",
    "diagrams",
  );

  await page.emulateMedia({ media: "print" });
  // Text pages and their legends are gone; both landscape diagrams remain.
  await expect(page.getByRole("region", { name: "Requirements" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Sequence diagrams" })).toBeHidden();
  await expect(page.getByRole("region", { name: "High-level design" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Low-level design" })).toBeVisible();
  await expect(page.locator(".export-diagram .diagram-legend").first()).toBeHidden();

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const raw = pdf.toString("latin1");
  const boxes = [...raw.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((match) =>
    match[1].split(/\s+/).map(Number),
  );
  const landscape = boxes.filter((box) => (box[2] ?? 0) > (box[3] ?? 0));
  // No cover, no text pages, no trailing blank: exactly HLD + LLD.
  expect(boxes).toHaveLength(2);
  expect(landscape).toHaveLength(2);
  fs.writeFileSync(path.join("test-results", "export-diagrams-only.pdf"), pdf);

  await page.emulateMedia({ media: "screen" });
  const toggle = page.getByRole("button", { name: /HLD \+ LLD only/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("article.export-doc")).toHaveAttribute("data-print-scope", "full");
});
