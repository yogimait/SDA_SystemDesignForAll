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
import { fillAuthForm } from "./helpers";

const USER = {
  id: "usr_export01",
  email: "export@example.com",
  planTier: "pro",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const AUTH_SEED = `
  window.sessionStorage.setItem("sda:auth:session", JSON.stringify({
    user: ${JSON.stringify(USER)},
    accessToken: "token_export_001",
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  }));
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
    ],
    relationships: [
      { id: "rel_1", kind: "association", sourceId: "cls_1", targetId: "cls_1", sourceMultiplicity: "1", targetMultiplicity: "0..*", label: "", rationale: "Key maps to counters." },
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
  await expect(page.getByText(/Download the SVG in each design section/)).toBeVisible();
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
  await expect(page.getByText("The model failed validation — export blocked.")).toBeVisible();
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

  await fillAuthForm(page, "export@example.com", "supersecret1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
