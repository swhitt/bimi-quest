import type { Metadata } from "next";
import { connection } from "next/server";
import { LeaderboardContent } from "../leaderboard/leaderboard-content";

export const metadata: Metadata = {
  alternates: { canonical: "/organizations" },
  title: "Organizations",
  description: "Organizations ranked by BIMI certificate count — VMC/CMC counts, active certs, and industries.",
};

export default async function OrganizationsPage() {
  await connection();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Organizations ranked by BIMI certificate count from Certificate Transparency logs.
        </p>
      </div>
      <LeaderboardContent />
    </div>
  );
}
