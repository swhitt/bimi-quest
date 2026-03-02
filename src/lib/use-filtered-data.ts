"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface UseFilteredDataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches data from a filter-aware API endpoint, automatically re-fetching when
 * global filters change. Uses AbortController to cancel in-flight requests on
 * filter changes, preventing stale responses from overwriting newer data.
 *
 * @param url - The API route path (e.g. "/api/stats/top-orgs")
 * @param extract - Maps the raw JSON response to the desired data shape
 * @param fallback - Returned as `data` before the first successful fetch and on error
 */
export function useFilteredData<T>(url: string, extract: (json: unknown) => T, fallback: T): UseFilteredDataResult<T> {
  const { buildApiParams } = useGlobalFilters();
  const filterParams = buildApiParams();
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);

  // Sync caller-provided values into refs so the fetch effect can use them
  // without needing them as deps (they're inline at call sites and unstable)
  const extractRef = useRef(extract);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    extractRef.current = extract;
    fallbackRef.current = fallback;
  });

  const doFetch = useCallback(
    (params: string, signal: AbortSignal) => {
      fetch(`${url}?${params}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((json) => {
          setData(extractRef.current(json));
          loadedRef.current = params;
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setError(err.message ?? "Failed to load");
            setData(fallbackRef.current);
          }
        })
        .finally(() => setLoading(false));
    },
    [url],
  );

  useEffect(() => {
    if (loadedRef.current === filterParams) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    doFetch(filterParams, controller.signal);
    return () => controller.abort();
  }, [filterParams, doFetch]);

  return { data, loading, error };
}
