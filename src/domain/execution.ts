/** Client receipt state. A timeout never means an on-chain transaction failed. */
export type LegState =
  | { status: "ready" }
  | { status: "awaiting-signature" }
  | { status: "submitted" | "unknown" | "confirmed"; signature: string }
  | { status: "failed"; reason: string; signature?: string };
export type LegEvent =
  | { type: "request-signature" }
  | { type: "rejected"; reason: string }
  | { type: "broadcast"; signature: string }
  | { type: "timeout" }
  | { type: "confirmed" }
  | { type: "chain-failed"; reason: string };
export function transition(state: LegState, event: LegEvent): LegState {
  if (state.status === "ready" && event.type === "request-signature")
    return { status: "awaiting-signature" };
  if (state.status === "awaiting-signature" && event.type === "rejected")
    return { status: "failed", reason: event.reason };
  if (
    state.status === "awaiting-signature" &&
    event.type === "broadcast" &&
    event.signature
  )
    return { status: "submitted", signature: event.signature };
  if (state.status === "submitted" || state.status === "unknown") {
    if (event.type === "timeout")
      return { status: "unknown", signature: state.signature };
    if (event.type === "confirmed")
      return { status: "confirmed", signature: state.signature };
    if (event.type === "chain-failed")
      return {
        status: "failed",
        signature: state.signature,
        reason: event.reason,
      };
  }
  throw new Error(
    `Invalid execution transition: ${state.status} -> ${event.type}`,
  );
}
export function executionSummary(
  legs: readonly LegState[],
): "not-started" | "pending" | "partial" | "complete" | "failed" {
  if (!legs.length || legs.every((l) => l.status === "ready"))
    return "not-started";
  if (legs.every((l) => l.status === "confirmed")) return "complete";
  if (legs.some((l) => l.status === "confirmed")) return "partial";
  if (
    legs.some((l) =>
      ["submitted", "unknown", "awaiting-signature"].includes(l.status),
    )
  )
    return "pending";
  return "failed";
}
