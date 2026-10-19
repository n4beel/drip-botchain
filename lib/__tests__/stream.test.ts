import { describe, expect, it } from "vitest";
import { progressBy, refundableBy, remaining, streamedBy, withdrawableBy, type Stream } from "../stream";

const base: Stream = {
  sender: "0x1111111111111111111111111111111111111111",
  recipient: "0x2222222222222222222222222222222222222222",
  startTime: 1000n,
  stopTime: 2000n,
  deposit: 1000n,
  withdrawn: 0n,
  cancelled: false,
};

/**
 * The figure on screen ticks between blocks, so it is computed here rather than read. If it
 * drifts from what `Drip.balanceOf` would pay, the user sees one number and withdraws another —
 * which is why this mirrors the contract's integer maths exactly rather than using floats.
 */
describe("streamedBy", () => {
  it("is zero before the stream starts", () => {
    expect(streamedBy(base, 999n)).toBe(0n);
    expect(streamedBy(base, 1000n)).toBe(0n);
  });

  it("is linear through the middle", () => {
    expect(streamedBy(base, 1500n)).toBe(500n);
    expect(streamedBy(base, 1250n)).toBe(250n);
  });

  it("is the whole deposit at and after the stop time", () => {
    expect(streamedBy(base, 2000n)).toBe(1000n);
    expect(streamedBy(base, 99999n)).toBe(1000n);
  });

  // Solidity truncates. Rounding up here would show more than a withdrawal could pay.
  it("truncates the way Solidity does", () => {
    const s = { ...base, deposit: 10n, stopTime: 1003n };
    expect(streamedBy(s, 1001n)).toBe(3n);
    expect(streamedBy(s, 1002n)).toBe(6n);
  });

  it("handles a zero-length stream", () => {
    expect(streamedBy({ ...base, stopTime: 1000n }, 1500n)).toBe(1000n);
  });
});

describe("withdrawableBy", () => {
  it("subtracts what has already been taken", () => {
    expect(withdrawableBy({ ...base, withdrawn: 200n }, 1500n)).toBe(300n);
  });

  it("never goes negative", () => {
    // Possible after a cancellation settles: withdrawn can exceed what the formula now yields.
    expect(withdrawableBy({ ...base, withdrawn: 900n }, 1100n)).toBe(0n);
  });

  it("is zero once cancelled", () => {
    expect(withdrawableBy({ ...base, cancelled: true }, 1500n)).toBe(0n);
  });
});

describe("refundableBy", () => {
  // The invariant that matters at cancellation: nothing is created, nothing vanishes.
  it("always complements what has streamed", () => {
    for (const t of [1000n, 1200n, 1500n, 1999n, 2000n]) {
      expect(streamedBy(base, t) + refundableBy(base, t)).toBe(base.deposit);
    }
  });

  it("is zero once cancelled", () => {
    expect(refundableBy({ ...base, cancelled: true }, 1500n)).toBe(0n);
  });
});

describe("progressBy", () => {
  it("runs 0 to 1", () => {
    expect(progressBy(base, 900n)).toBe(0);
    expect(progressBy(base, 1500n)).toBeCloseTo(0.5, 4);
    expect(progressBy(base, 5000n)).toBe(1);
  });
});

describe("remaining", () => {
  it("picks the two units that matter", () => {
    const long = { ...base, startTime: 0n, stopTime: 300000n };
    expect(remaining(long, 0n)).toMatch(/^3d /);
    expect(remaining({ ...base, stopTime: 1_000_000n }, 996_400n)).toMatch(/^1h /);
    expect(remaining(base, 1940n)).toBe("1m 0s");
    expect(remaining(base, 2000n)).toBe("finished");
  });
});
