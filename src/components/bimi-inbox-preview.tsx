"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BimiInboxPreviewProps {
  domain: string;
  logoUrl: string | null;
  grade: string | null;
}

interface MockEmail {
  subject: string;
  snippet: string;
  time: string;
  selected?: boolean;
}

const MOCK_EMAILS: MockEmail[] = [
  {
    subject: "Your account summary is ready",
    snippet: "Here's your monthly overview with recent activity and recommendations...",
    time: "10:42 AM",
    selected: true,
  },
  {
    subject: "Order confirmation #8294",
    snippet: "Thank you for your purchase. Your order has been confirmed and is being...",
    time: "9:15 AM",
  },
  {
    subject: "Monthly newsletter",
    snippet: "This month's highlights, product updates, and what's coming next...",
    time: "Yesterday",
  },
];

function VerifiedBadge() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500"
      title="Verified sender (VMC)"
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2.5 6L5 8.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BimiInboxPreview({ domain, logoUrl, grade }: BimiInboxPreviewProps) {
  if (!logoUrl) return null;

  const proxyUrl = `/api/proxy/svg?url=${encodeURIComponent(logoUrl)}`;
  const hasVmc = grade === "A";
  // Use just the base domain as the sender display name
  const senderName = domain.replace(/^www\./, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-md border">
          {MOCK_EMAILS.map((email, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                email.selected && "bg-primary/5",
                i < MOCK_EMAILS.length - 1 && "border-b",
              )}
            >
              {/* Avatar */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proxyUrl} alt="" className="h-10 w-10 shrink-0 rounded-full border object-contain" />

              {/* Sender, subject, snippet */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("truncate text-sm", email.selected ? "font-semibold" : "font-medium")}>
                    {senderName}
                  </span>
                  {hasVmc && <VerifiedBadge />}
                </div>
                <p className={cn("truncate text-sm", email.selected ? "font-medium" : "text-foreground")}>
                  {email.subject}
                </p>
                <p className="text-muted-foreground truncate text-xs">{email.snippet}</p>
              </div>

              {/* Timestamp */}
              <span className="text-muted-foreground shrink-0 text-xs">{email.time}</span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Preview of how {domain}&apos;s BIMI logo appears in supporting email clients
        </p>
      </CardContent>
    </Card>
  );
}
