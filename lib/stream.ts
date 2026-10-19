/**
 * What a stream has paid out, computed the same way the contract computes it.
 *
 * The contract settles by elapsed seconds, so the figure on screen must tick between blocks or it
 * is wrong for most of the time anyone is looking at it. This runs client-side on a timer and
 * uses integer maths throughout, matching `Drip.balanceOf` exactly — a display that drifts from
 * what a withdrawal actually pays would be worse than showing nothing.
 */

export type Stream = {
  sender: `0x${string}`;
  recipient: `0x${string}`;
  startTime: bigint;
  stopTime: bigint;
  deposit: bigint;
  withdrawn: bigint;
  cancelled: boolean;
};

/**
 * Total streamed to the recipient by `now`, before subtracting withdrawals.
 *
 * Integer division, truncating, exactly as Solidity does. Doing this in floating point would make
 * the UI and the chain disagree in the last few wei, which is precisely where a user checks.
 */
export function streamedBy(stream: Stream, now: bigint): bigint {
  if (now <= stream.startTime) return 0n;

  const duration = stream.stopTime - stream.startTime;
  if (duration <= 0n) return stream.deposit;

  const elapsed = now >= stream.stopTime ? duration : now - stream.startTime;
  return (stream.deposit * elapsed) / duration;
}

/** What the recipient could withdraw right now. */
export function withdrawableBy(stream: Stream, now: bigint): bigint {
  if (stream.cancelled) return 0n;
  const streamed = streamedBy(stream, now);
  return streamed > stream.withdrawn ? streamed - stream.withdrawn : 0n;
}

/** What would return to the sender if they cancelled at `now`. */
export function refundableBy(stream: Stream, now: bigint): bigint {
  if (stream.cancelled) return 0n;
  return stream.deposit - streamedBy(stream, now);
}

/** 0 to 1. Used only for the progress bar, never for a figure shown as an amount. */
export function progressBy(stream: Stream, now: bigint): number {
  const duration = stream.stopTime - stream.startTime;
  if (duration <= 0n) return 1;
  if (now <= stream.startTime) return 0;
  if (now >= stream.stopTime) return 1;
  return Number(((now - stream.startTime) * 10_000n) / duration) / 10_000;
}

/** "3d 4h 12m" — what is left, in the largest two units that matter. */
export function remaining(stream: Stream, now: bigint): string {
  if (now >= stream.stopTime) return "finished";
  const seconds = Number(stream.stopTime - now);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
