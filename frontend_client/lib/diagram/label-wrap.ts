/**
 * Greedy word-wrap for edge labels on the SVG canvases: SVG <text> does not
 * wrap, so long labels painted straight across a node gap bled over the
 * neighbouring nodes. Wrap to a small budget of lines; overflow beyond the
 * line budget truncates the last line with an ellipsis (full text lives in
 * the details panel and the canvas aria-labels).
 */
export function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    // A lone word wider than the budget keeps its own line (overshoot)
    // instead of splitting mid-word or starting from an empty line.
    if (candidate.length <= maxChars || line === "") {
      line = candidate;
      continue;
    }
    if (lines.length < maxLines - 1) {
      lines.push(line);
      line = word;
      continue;
    }
    // Last allowed line — keep as much as fits, mark the cut.
    lines.push(`${line.slice(0, Math.max(1, maxChars - 1))}…`);
    return lines;
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [text];
}
