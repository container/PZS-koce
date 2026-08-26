import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type CacheEntry<T> = {
  value: T;
  createdAt: number;
  expiresAt: number;
};

const CACHE_FILE = join(process.cwd(), ".cache", "bentral-cache.json");
const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

let loaded = false;
let writeTimer: NodeJS.Timeout | undefined;

export type CacheHit<T> = {
  value: T;
  createdAt: number;
  expiresAt: number;
  ageMs: number;
};

export function getCached<T>(key: string): T | undefined {
  return getCachedEntry<T>(key)?.value;
}

export function getCachedEntry<T>(key: string): CacheHit<T> | undefined {
  loadPersistentCache();

  const entry = cache.get(key);

  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    schedulePersist();
    return undefined;
  }

  return {
    value: entry.value as T,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    ageMs: Date.now() - entry.createdAt,
  };
}

export function setCached<T>(key: string, value: T, ttlMs: number): T {
  loadPersistentCache();

  cache.set(key, {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
  schedulePersist();

  return value;
}

export async function getOrSetCached<T>(
  key: string,
  ttlMs: number,
  factory: () => Promise<T>,
): Promise<{
  value: T;
  cached: boolean;
  createdAt?: number;
  expiresAt?: number;
  ageMs?: number;
}> {
  const cached = getCachedEntry<T>(key);

  if (cached !== undefined) {
    return { ...cached, cached: true };
  }

  const existing = pending.get(key) as Promise<T> | undefined;

  if (existing) {
    return { value: await existing, cached: true };
  }

  const promise = factory();
  pending.set(key, promise);

  try {
    const value = await promise;
    setCached(key, value, ttlMs);
    return { value, cached: false };
  } finally {
    pending.delete(key);
  }
}

function loadPersistentCache() {
  if (loaded) {
    return;
  }

  loaded = true;

  if (!existsSync(CACHE_FILE)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<
      string,
      CacheEntry<unknown>
    >;
    const now = Date.now();

    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && entry.expiresAt > now) {
        cache.set(key, entry);
      }
    }
  } catch (error) {
    console.warn("[cache] failed to read persistent cache", error);
  }
}

function schedulePersist() {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(persistNow, 150);
}

function persistNow() {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(
      CACHE_FILE,
      JSON.stringify(Object.fromEntries(cache.entries())),
      "utf8",
    );
  } catch (error) {
    console.warn("[cache] failed to write persistent cache", error);
  }
}
