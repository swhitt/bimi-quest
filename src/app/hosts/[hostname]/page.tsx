import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ hostname: string }>;
}

export default async function HostPage({ params }: Props) {
  const { hostname } = await params;
  permanentRedirect(`/domains/${hostname}`);
}
