import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CTLogContent } from "./ct-log-content";

export const metadata: Metadata = {
  title: "CT Log Viewer",
  description: "Browse and inspect raw Certificate Transparency log entries from Gorgon.",
};

export default async function CTLogPage() {
  await connection();
  return (
    <Suspense>
      <CTLogContent />
    </Suspense>
  );
}
