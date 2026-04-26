import { api } from '../api';

const STALE_MS = 30_000;

let _data      = null;
let _fetchedAt = 0;
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
            _data      = res.data.data || [];
            _fetchedAt = Date.now();
            return _data;
        })
        .finally(() => { _inflight = null; });
    return _inflight;
}

/** Force-invalidate so next call always fetches fresh */
export const invalidate = () => { _fetchedAt = 0; };
