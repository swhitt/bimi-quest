/**
 * Lightweight Server-Timing helper.
 * Usage:
 *   const timing = serverTiming();
 *   // ... do work ...
 *   response.headers.set("Server-Timing", timing.header("db"));
 */
export function serverTiming() {
  const start = performance.now();
  return {
    /** Returns a Server-Timing header value, e.g. "db;dur=12.3" */
    header(name = "total") {
      const dur = (performance.now() - start).toFixed(1);
      return `${name};dur=${dur}`;
    },
    /** Elapsed milliseconds */
    elapsed() {
      return performance.now() - start;
    },
  };
}
