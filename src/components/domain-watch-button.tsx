"use client";

import { Bell, BellRing, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const WEBHOOK_STORAGE_KEY = "bimi-quest-discord-webhook";

interface DomainWatchButtonProps {
  domain: string;
}

export function DomainWatchButton({ domain }: DomainWatchButtonProps) {
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const getWebhookUrl = useCallback((): string | null => {
    try {
      return localStorage.getItem(WEBHOOK_STORAGE_KEY);
    } catch {
      return null;
    }
  }, []);

  const promptForWebhook = useCallback((): string | null => {
    const existing = getWebhookUrl();
    const url = window.prompt("Enter your Discord webhook URL to receive change alerts:", existing ?? "");
    if (!url?.trim()) return null;
    try {
      localStorage.setItem(WEBHOOK_STORAGE_KEY, url.trim());
    } catch {
      // localStorage unavailable; proceed with the URL anyway
    }
    return url.trim();
  }, [getWebhookUrl]);

  // Check initial watch status on mount
  useEffect(() => {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
      setLoading(false);
      return;
    }

    fetch(`/api/domains/${encodeURIComponent(domain)}/watch?webhookUrl=${encodeURIComponent(webhookUrl)}`)
      .then((res) => res.json())
      .then((data) => setWatching(data.watching === true))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [domain, getWebhookUrl]);

  const handleToggle = async () => {
    let webhookUrl = getWebhookUrl();

    // If not watching and no webhook stored, prompt for one
    if (!watching && !webhookUrl) {
      webhookUrl = promptForWebhook();
      if (!webhookUrl) return;
    }

    // If watching and wanting to unwatch, we need the stored URL
    if (watching && !webhookUrl) {
      // Edge case: watching but lost the stored URL
      webhookUrl = promptForWebhook();
      if (!webhookUrl) return;
    }

    setToggling(true);

    try {
      const method = watching ? "DELETE" : "POST";
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/watch`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });

      if (res.ok) {
        setWatching(!watching);
      }
    } catch {
      // Silently fail; the button state remains unchanged
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={toggling}
      aria-label={watching ? "Stop watching domain" : "Watch domain for changes"}
      title={watching ? "Stop watching domain" : "Watch domain for changes"}
    >
      {toggling ? (
        <Loader2 className="size-4 animate-spin" />
      ) : watching ? (
        <BellRing className="size-4" />
      ) : (
        <Bell className="size-4" />
      )}
      <span className="ml-1.5">{watching ? "Watching" : "Watch"}</span>
    </Button>
  );
}
