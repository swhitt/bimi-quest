// Bidirectional mapping between URL slugs and issuer CA org names from certificates
export const CA_SLUG_TO_NAME: Record<string, string> = {
  digicert: "DigiCert",
  entrust: "Entrust",
  globalsign: "GlobalSign nv-sa",
  sslcom: "SSL Corporation",
  sectigo: "Sectigo Limited",
};

export const CA_NAME_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CA_SLUG_TO_NAME).map(([slug, name]) => [name, slug]),
);

// Display-friendly label for each issuer CA
export const CA_DISPLAY_NAMES: Record<string, string> = {
  digicert: "DigiCert",
  entrust: "Entrust",
  globalsign: "GlobalSign",
  sslcom: "SSL.com",
  sectigo: "Sectigo",
};

export const ALL_CA_SLUGS = Object.keys(CA_SLUG_TO_NAME);

// Root CA mapping: raw DB value -> display name
// Used for the root CA query-param filter (values are the raw DB strings)
export const ROOT_CA_OPTIONS: { value: string; label: string }[] = [
  { value: "DigiCert", label: "DigiCert" },
  { value: "Entrust", label: "Entrust" },
  { value: "GlobalSign nv-sa", label: "GlobalSign" },
  { value: "SSL Corporation", label: "SSL.com" },
];

export function caSlugToName(slug: string): string | undefined {
  return CA_SLUG_TO_NAME[slug.toLowerCase()];
}

export function caNameToSlug(name: string): string | undefined {
  return CA_NAME_TO_SLUG[name];
}
