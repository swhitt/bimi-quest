"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";

const KNOWN_CAS = [
  "SSL.com",
  "DigiCert",
  "Entrust",
  "GlobalSign",
  "Sectigo",
];

export function CASelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedCA, setSelectedCA] = useState(
    searchParams.get("ca") || "SSL.com"
  );

  useEffect(() => {
    const stored = localStorage.getItem("bimi-intel-ca");
    if (stored && !searchParams.get("ca")) {
      setSelectedCA(stored);
    }
  }, [searchParams]);

  function handleChange(value: string) {
    setSelectedCA(value);
    localStorage.setItem("bimi-intel-ca", value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("ca", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={selectedCA} onValueChange={handleChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select CA" />
      </SelectTrigger>
      <SelectContent>
        {KNOWN_CAS.map((ca) => (
          <SelectItem key={ca} value={ca}>
            {ca}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
