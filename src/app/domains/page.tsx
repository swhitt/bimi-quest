import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DomainSearch } from "./domain-search";

export const metadata: Metadata = {
  title: "Domains",
  description: "Search and explore BIMI DNS records across domains",
};

export default async function DomainsPage() {
  await connection();
  return (
    <Suspense>
      <DomainSearch />
    </Suspense>
  );
}
