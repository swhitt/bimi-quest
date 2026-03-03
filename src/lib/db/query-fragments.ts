import { count, sql } from "drizzle-orm";
import { certificates } from "./schema";

export const vmcCount = count(sql`CASE WHEN ${certificates.certType} = 'VMC' THEN 1 END`).as("vmc_count");
export const cmcCount = count(sql`CASE WHEN ${certificates.certType} = 'CMC' THEN 1 END`).as("cmc_count");
