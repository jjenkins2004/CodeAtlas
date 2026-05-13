export type DebounceCallback = () => void;

export interface DebounceServicePort {
  debounce(key: string, time: number, callback: DebounceCallback): void;

  hasPending(key: string): boolean;

  remove(key: string): void;
}

type DebounceEntry = {
  timeoutId: ReturnType<typeof setTimeout>;
};

export class DebounceService implements DebounceServicePort {
  private readonly entries = new Map<string, DebounceEntry>();

  hasPending(key: string): boolean {
    return this.entries.has(key);
  }

  remove(key: string): void {
    const existingEntry = this.entries.get(key);

    if (!existingEntry) {
      return;
    }

    clearTimeout(existingEntry.timeoutId);
    this.entries.delete(key);
  }

  debounce(key: string, time: number, callback: DebounceCallback): void {
    const existingEntry = this.entries.get(key);

    if (existingEntry) {
      clearTimeout(existingEntry.timeoutId);
    }

    const entry: DebounceEntry = {
      timeoutId: setTimeout(() => {
        this.entries.delete(key);
        callback();
      }, time),
    };

    this.entries.set(key, entry);
  }
}

export const debounceService = new DebounceService();
