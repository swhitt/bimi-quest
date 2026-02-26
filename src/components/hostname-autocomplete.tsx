"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Input } from "@/components/ui/input";

interface Suggestion {
  label: string;
  type: "domain" | "org";
  count: number;
}

interface HostnameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string, type: "domain" | "org") => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function HostnameAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Lookup hostname...",
  className = "",
  inputClassName = "",
  disabled = false,
  autoFocus = false,
}: HostnameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const fetchSuggestions = useCallback(async (query: string) => {
    abortRef.current?.abort();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/autocomplete?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      if (!res.ok) return;
      const data: Suggestion[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
      setActiveIndex(-1);
    } catch {
      // Aborted or network error
    }
  }, []);

  // Debounced fetch
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(value), 200);
    return () => clearTimeout(timerRef.current);
  }, [value, fetchSuggestions]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(value, "domain");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          const s = suggestions[activeIndex];
          onChange(s.label);
          onSelect(s.label, s.type);
        } else {
          onSelect(value, "domain");
        }
        setOpen(false);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  function handleSelect(s: Suggestion) {
    onChange(s.label);
    onSelect(s.label, s.type);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClassName}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
      />
      {open && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.label}`}
              id={`${baseId}-option-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors ${
                i === activeIndex ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-8">
                {s.type === "domain" ? "host" : "org"}
              </span>
              <span className="truncate flex-1">{s.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {s.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
