import type { Metadata } from "next";
import { connection } from "next/server";
import { LeaderboardContent } from "./leaderboard-content";

export const metadata: Metadata = {
  title: "BIMI Adoption Leaderboard",
  description: "Rankings of organizations by BIMI certificate adoption — VMC/CMC counts, active certs, and industries.",
};

export default async function LeaderboardPage() {
  await connection();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold">BIMI Adoption Leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          Organizations ranked by BIMI certificate count from Certificate Transparency logs.
        </p>
      </div>
      <LeaderboardContent />
    </div>
  );
}
