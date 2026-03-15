import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DomainSearch } from "./domain-search";

export async function generateMetadata(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const hasFilters = Object.keys(searchParams).some((k) => k !== "page");
  return {
    alternates: { canonical: "/domains" },
    ...(hasFilters && { robots: { index: false } }),
    title: "Domains",
    description: "Search and explore BIMI DNS records across domains",
  };
}

export default async function DomainsPage() {
  await connection();
  return (
    <Suspense>
      <DomainSearch />
    </Suspense>
  );
}
