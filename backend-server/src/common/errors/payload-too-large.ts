export function isPayloadTooLarge(exception: unknown): boolean {
  return (
    typeof exception === "object" &&
    exception !== null &&
    (exception as { type?: unknown }).type === "entity.too.large"
  );
}
