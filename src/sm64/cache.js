import { CACHE_MAX_AGE_MS } from './config';

// Module-scoped, not persisted: survives closing/reopening the overlay
// while the page stays loaded, but resets on an actual page refresh (a new
// module instance) so a reload always gets the current sheet data.
let cache = null;

export function loadCache() {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_MAX_AGE_MS) return null;
  return cache;
}

export function saveCache(data) {
  cache = { ...data, fetchedAt: Date.now() };
}
