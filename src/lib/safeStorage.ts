/**
 * SafeStorage utility
 * Wraps window.localStorage with an in-memory fallback to avoid crashes 
 * in sandbox, iframe, or private browsing environments where storage is blocked.
 */

class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

class SafeStorage {
  private isSupported: boolean;
  private fallbackStore: MemoryStorage;

  constructor() {
    this.fallbackStore = new MemoryStorage();
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      this.isSupported = true;
    } catch (e) {
      this.isSupported = false;
    }
  }

  getItem(key: string): string | null {
    if (this.isSupported) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return this.fallbackStore.getItem(key);
      }
    }
    return this.fallbackStore.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.isSupported) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        // Fallback to memory on write errors/quota full
      }
    }
    this.fallbackStore.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.isSupported) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        // Fallback
      }
    }
    this.fallbackStore.removeItem(key);
  }

  clear(): void {
    if (this.isSupported) {
      try {
        window.localStorage.clear();
        return;
      } catch (e) {
        // Fallback
      }
    }
    this.fallbackStore.clear();
  }
}

export const safeStorage = new SafeStorage();
