import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ hash: string; slug?: string[] }>;
}

export default async function OldLogoPage({ params }: Props) {
  const { hash, slug } = await params;
  const slugPart = slug?.length ? `/${slug.join("/")}` : "";
  permanentRedirect(`/logos/${hash}${slugPart}`);
}
