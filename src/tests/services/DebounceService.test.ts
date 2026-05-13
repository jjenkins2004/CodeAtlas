import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebounceService } from "../../services/util/DebounceService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DebouncedItem = {
  id: string;
  value: number;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DebounceService", () => {
  let service: DebounceService;

  beforeEach(() => {
    service = new DebounceService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // debounce()
  // ---------------------------------------------------------------------------

  describe("debounce()", () => {
    it("resets the timer for the same key", () => {
      const callback = vi.fn<() => void>();

      service.debounce("item", 100, callback);
      vi.advanceTimersByTime(50);
      service.debounce("item", 100, callback);

      expect(service.hasPending("item")).toBe(true);

      vi.advanceTimersByTime(50);

      expect(callback).not.toHaveBeenCalled();
      expect(service.hasPending("item")).toBe(true);

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(service.hasPending("item")).toBe(false);
    });

    it("keeps separate timers for different keys", () => {
      const callback = vi.fn<() => void>();

      service.debounce("first", 100, callback);
      service.debounce("second", 200, callback);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);

      service.debounce("second", 100, callback);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("removes a pending timer when requested", () => {
      const callback = vi.fn<() => void>();

      service.debounce("item", 100, callback);

      expect(service.hasPending("item")).toBe(true);

      service.remove("item");

      expect(service.hasPending("item")).toBe(false);

      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalled();
    });

    it("ignores remove requests for missing keys", () => {
      expect(() => service.remove("missing")).not.toThrow();
      expect(service.hasPending("missing")).toBe(false);
    });
  });
});
