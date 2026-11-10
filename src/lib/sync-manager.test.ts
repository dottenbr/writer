import { describe, it, expect, vi } from "vitest";
import { withTimeout, withRetry, TimeoutError } from "./sync-manager";

describe("withTimeout", () => {
  it("resolves if the promise settles before the timeout", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it("rejects with TimeoutError if the promise takes too long", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 5000));
    await expect(withTimeout(slow, 50)).rejects.toThrow(TimeoutError);
  });

  it("propagates the original error if the promise rejects before timeout", async () => {
    const failing = Promise.reject(new Error("boom"));
    await expect(withTimeout(failing, 1000)).rejects.toThrow("boom");
  });
});

describe("withRetry", () => {
  it("returns on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, timeoutMs: 1000, initialDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on a later attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 5, timeoutMs: 1000, initialDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetry(fn, { maxAttempts: 3, timeoutMs: 1000, initialDelayMs: 10, maxDelayMs: 100 })
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("applies timeout to each attempt", async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 5000))
    );
    await expect(
      withRetry(fn, { maxAttempts: 2, timeoutMs: 50, initialDelayMs: 10, maxDelayMs: 100 })
    ).rejects.toThrow(TimeoutError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
