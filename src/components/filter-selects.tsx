"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_CA_SLUGS, CA_DISPLAY_NAMES, ROOT_CA_OPTIONS } from "@/lib/ca-slugs";
import { ALL_MARK_TYPES } from "@/lib/mark-types";

const CERT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "VMC", label: "VMC" },
  { value: "CMC", label: "CMC" },
];

const MARK_OPTIONS = [
  { value: "all", label: "All Marks" },
  ...ALL_MARK_TYPES.map((m) => ({ value: m.value, label: m.title })),
];

const VALIDITY_OPTIONS = [
  { value: "all", label: "Any Status" },
  { value: "valid", label: "Valid" },
  { value: "expired", label: "Expired" },
];

const PRECERT_OPTIONS = [
  { value: "all", label: "Cert & Precert" },
  { value: "cert", label: "Certs Only" },
  { value: "precert", label: "Precerts Only" },
];

export { MARK_OPTIONS, ROOT_CA_OPTIONS };

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function CASelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by intermediate CA" className={className ?? "w-[175px]"}>
        <SelectValue placeholder="All Intermediates" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Intermediates</SelectItem>
        {ALL_CA_SLUGS.map((slug) => (
          <SelectItem key={slug} value={slug}>
            {CA_DISPLAY_NAMES[slug]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RootCASelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by root CA" className={className ?? "w-[140px]"}>
        <SelectValue placeholder="All Roots" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Roots</SelectItem>
        {ROOT_CA_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TypeSelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by certificate type" className={className ?? "w-[110px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CERT_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MarkSelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by mark type" className={className ?? "w-[160px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MARK_OPTIONS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ValiditySelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by validity status" className={className ?? "w-[120px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VALIDITY_OPTIONS.map((v) => (
          <SelectItem key={v.value} value={v.value}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrecertSelect({ value, onChange, className }: SelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by precertificate status" className={className ?? "w-[140px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRECERT_OPTIONS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function IndustrySelect({
  value,
  onChange,
  options,
  className,
}: SelectProps & { options: { value: string; label: string }[] }) {
  if (options.length === 0) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by industry" className={className ?? "w-[170px]"}>
        <SelectValue placeholder="All Industries" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Industries</SelectItem>
        {options.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatCountryName(code: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountrySelect({ value, onChange, className }: SelectProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/stats/countries")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.countries)) {
          setOptions(
            d.countries.map((c: { country: string; count: number }) => ({
              value: c.country,
              label: `${formatCountryName(c.country)} (${c.count})`,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  if (options.length === 0) return null;

  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label="Filter by country" className={className ?? "w-[170px]"}>
        <SelectValue placeholder="All Countries" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Countries</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
