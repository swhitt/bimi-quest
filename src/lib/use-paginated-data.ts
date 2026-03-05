"use client";

import { useEffect, useRef, useState } from "react";
import { useGlobalFilters } from "@/lib/use-global-filters";

interface UsePaginatedDataResult<T> {
  data: T[];
  page: number;
  totalPages: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  loading: boolean;
}

/**
 * Fetches paginated data from a filter-aware API endpoint. Re-fetches when
 * global filters or page changes. Resets to page 1 when filters change.
 */
export function usePaginatedData<T>({
  url,
  pageSize,
  extraParams,
  extractData,
  extractTotalPages,
  initialData,
  initialTotalPages,
}: {
  url: string;
  pageSize: number;
  extraParams?: Record<string, string>;
  extractData: (json: unknown) => T[];
  extractTotalPages: (json: unknown) => number;
  initialData?: T[];
  initialTotalPages?: number;
}): UsePaginatedDataResult<T> {
  const { buildApiParams } = useGlobalFilters();
  const [data, setData] = useState<T[]>(initialData ?? []);
  const [totalPages, setTotalPages] = useState(initialTotalPages ?? 1);
  const [page, setPage] = useState(1);
  const [loadedParams, setLoadedParams] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(!!initialData);
  const [prevBaseFilter, setPrevBaseFilter] = useState<string | null>(null);

  const extractDataRef = useRef(extractData);
  const extractTotalPagesRef = useRef(extractTotalPages);
  useEffect(() => {
    extractDataRef.current = extractData;
    extractTotalPagesRef.current = extractTotalPages;
  });

  const baseFilterParams = buildApiParams();
  const filterParams = buildApiParams({
    page: String(page),
    limit: String(pageSize),
    ...extraParams,
  });

  // Reset page when global filters change
  if (prevBaseFilter !== null && prevBaseFilter !== baseFilterParams) {
    setPrevBaseFilter(baseFilterParams);
    setPage(1);
  }
  if (prevBaseFilter === null) {
    setPrevBaseFilter(baseFilterParams);
  }

  // Skip first fetch when we have server-provided data
  if (isInitialLoad) {
    setIsInitialLoad(false);
    setLoadedParams(filterParams);
  }

  useEffect(() => {
    if (loadedParams === filterParams) return;

    const controller = new AbortController();

    fetch(`${url}?${filterParams}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(extractDataRef.current(json));
        setTotalPages(extractTotalPagesRef.current(json));
        setLoadedParams(filterParams);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setData([]);
      });

    return () => controller.abort();
  }, [filterParams, loadedParams, url]);

  const loading = loadedParams !== filterParams;

  return { data, page, totalPages, setPage, loading };
}
