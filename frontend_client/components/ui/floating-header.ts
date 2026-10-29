/**
 * Shared floating-header treatment (QA fix): the app shell sits on a contained
 * rounded card with backdrop blur — it floats above scrolling content instead
 * of sticking edge-to-edge. Landing / portal / workspace headers share it.
 */
export const FLOATING_HEADER_SHELL = "sticky top-0 z-40 w-full px-3 pt-3 sm:px-4";
export const FLOATING_HEADER_CARD =
  "border-border bg-card/80 rounded-xl border border-solid backdrop-blur-sm";
