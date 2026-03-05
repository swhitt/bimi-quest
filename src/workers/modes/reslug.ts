import type { NeonQueryFunction } from "@neondatabase/serverless";
import { slugify } from "@/lib/slugify";

/**
 * Backfill subject_org_slug for all rows where it is NULL but subject_org is set.
 * Groups by distinct org name to minimize round-trips.
 */
export async function reslug(sql: NeonQueryFunction<false, false>) {
  console.log("Backfilling subject_org_slug for rows with NULL slug...\n");

  // Get all distinct org names that need slugs
  const orgs = (await sql`
    SELECT DISTINCT subject_org
    FROM certificates
    WHERE subject_org IS NOT NULL AND subject_org_slug IS NULL
  `) as { subject_org: string }[];

  console.log(`Found ${orgs.length} distinct orgs to slug.\n`);

  let updated = 0;
  for (const { subject_org } of orgs) {
    const slug = slugify(subject_org);
    await sql`
      UPDATE certificates
      SET subject_org_slug = ${slug}
      WHERE subject_org = ${subject_org} AND subject_org_slug IS NULL
    `;
    updated++;
    if (updated % 50 === 0) {
      console.log(`  Processed ${updated}/${orgs.length} orgs...`);
    }
  }

  console.log(`\nDone. Updated slugs for ${updated} distinct orgs.`);
}
