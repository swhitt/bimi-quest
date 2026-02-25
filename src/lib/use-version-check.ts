"use client";

import { useEffect, useState } from "react";

const INTERVAL = 30_000; // 30 seconds
const buildSha = process.env.NEXT_PUBLIC_COMMIT_SHA;

export function useVersionCheck() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!buildSha) return;

    const check = async () => {
      try {
        const res = await fetch("/api/version", {
          headers: { "If-None-Match": `"${buildSha}"` },
        });
        // 304 = same version, 200 = new version
        if (res.status === 200) {
          const remote = (await res.text()).trim();
          if (remote && remote !== buildSha) setStale(true);
        }
      } catch {}
    };

    const id = setInterval(check, INTERVAL);
    return () => clearInterval(id);
  }, []);

  return stale;
}
