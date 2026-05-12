export type DebounceCallback<T> = (obj: T) => void;

type DebounceEntry = {
  timeoutId: ReturnType<typeof setTimeout>;
};

export class DebounceService {
  private readonly entries = new Map<string, DebounceEntry>();

  hasPending(key: string): boolean {
    return this.entries.has(key);
  }

  debounce<T>(
    key: string,
    obj: T,
    time: number,
    callback: DebounceCallback<T>,
  ): void {
    const existingEntry = this.entries.get(key);

    if (existingEntry) {
      clearTimeout(existingEntry.timeoutId);
    }

    const entry: DebounceEntry = {
      timeoutId: setTimeout(() => {
        this.entries.delete(key);
        callback(obj);
      }, time),
    };

    this.entries.set(key, entry);
  }
}

export const debounceService = new DebounceService();
