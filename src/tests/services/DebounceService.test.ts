import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebounceService } from "../../services/DebounceService.js";

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
    it("invokes the callback with the latest object after the delay", () => {
      const callback = vi.fn<(item: DebouncedItem) => void>();
      const firstItem: DebouncedItem = { id: "a", value: 1 };
      const secondItem: DebouncedItem = { id: "b", value: 2 };

      service.debounce("item", firstItem, 100, callback);
      service.debounce("item", secondItem, 100, callback);

      expect(service.hasPending("item")).toBe(true);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(secondItem);
      expect(service.hasPending("item")).toBe(false);
    });

    it("keeps separate timers for different keys", () => {
      const callback = vi.fn<(item: DebouncedItem) => void>();
      const firstItem: DebouncedItem = { id: "a", value: 1 };
      const secondItem: DebouncedItem = { id: "b", value: 2 };

      service.debounce("first", firstItem, 100, callback);
      service.debounce("second", secondItem, 200, callback);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenNthCalledWith(1, firstItem);

      service.debounce("second", secondItem, 100, callback);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(2, secondItem);
    });
  });
});
