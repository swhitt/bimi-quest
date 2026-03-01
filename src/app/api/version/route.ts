const sha = process.env.NEXT_PUBLIC_COMMIT_SHA || "dev";

export function GET() {
  return new Response(sha, {
    headers: {
      "Content-Type": "text/plain",
      ETag: `"${sha}"`,
      "Cache-Control": "no-cache",
    },
  });
}
