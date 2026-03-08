import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { domainWatches } from "@/lib/db/schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const webhookUrl = request.nextUrl.searchParams.get("webhookUrl");

  if (!webhookUrl) {
    return NextResponse.json({ error: "webhookUrl query param is required" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({ id: domainWatches.id })
      .from(domainWatches)
      .where(and(eq(domainWatches.domain, domain), eq(domainWatches.webhookUrl, webhookUrl)))
      .limit(1);

    return NextResponse.json({ watching: !!row });
  } catch (error) {
    return apiError(error, "domain.watch.get.failed", `/api/domains/${domain}/watch`, "Failed to check watch status");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;

  let body: { webhookUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { webhookUrl } = body;
  if (!webhookUrl || typeof webhookUrl !== "string") {
    return NextResponse.json({ error: "webhookUrl is required" }, { status: 400 });
  }

  try {
    await db.insert(domainWatches).values({ domain, webhookUrl }).onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "domain.watch.post.failed", `/api/domains/${domain}/watch`, "Failed to create watch");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;

  let body: { webhookUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { webhookUrl } = body;
  if (!webhookUrl || typeof webhookUrl !== "string") {
    return NextResponse.json({ error: "webhookUrl is required" }, { status: 400 });
  }

  try {
    await db
      .delete(domainWatches)
      .where(and(eq(domainWatches.domain, domain), eq(domainWatches.webhookUrl, webhookUrl)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "domain.watch.delete.failed", `/api/domains/${domain}/watch`, "Failed to remove watch");
  }
}
