import { api } from '../api';

const STALE_MS  = 30_000;
const CACHE_KEY = 'ts_predictions_cache';

// Load initial data from LocalStorage for instant-on experience
const _cached = localStorage.getItem(CACHE_KEY);
let _data      = _cached ? JSON.parse(_cached) : null;
let _fetchedAt = _cached ? Date.now() : 0; // Assume fresh on first load if we have cache
let _inflight  = null;

/** Cached data — null on first ever load */
export const getCached = () => _data;

/** True when cache is absent or older than STALE_MS */
export const isStale = () => !_data || (Date.now() - _fetchedAt) > STALE_MS;

/**
 * Fetch fresh predictions. Deduplicates concurrent calls so only one
 * network request flies even if multiple components call this at once.
 */
export function fetchPredictions() {
    if (_inflight) return _inflight;
    _inflight = api.getHistory()
        .then(res => {
            const data = res.data.data || [];
            _data      = data;
            _fetchedAt = Date.now();
            
            // Persist for instant-on next time
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn('Cache persistence failed:', e);
            }
            
            return _data;
        })
        .finally(() => { _inflight = null; });
    return _inflight;
}

/** Force-invalidate so next call always fetches fresh */
export const invalidate = () => { 
    _fetchedAt = 0; 
    localStorage.removeItem(CACHE_KEY);
};
