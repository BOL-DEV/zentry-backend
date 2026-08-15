import type { PostgresSession } from "../db/pg";
import Organizer from "../models/organizer";
import DashboardUser from "../models/dasboardUser";
import { generateSlug } from "../utils/slugify";

type ResolveUniqueOrganizerSlugArgs = {
  name: string;
  preferredSlug?: string;
  session?: PostgresSession;
};

export const resolveUniqueOrganizerSlug = async ({
  name,
  preferredSlug,
  session,
}: ResolveUniqueOrganizerSlugArgs) => {
  const preferred =
    typeof preferredSlug === "string" ? preferredSlug.trim() : "";

  const base = generateSlug(preferred || name);
  if (!base) return "";

  let candidate = base;
  let counter = 1;

  // Keep suffixing until it no longer conflicts with a real organizer.
  // Use the provided transaction session when available.
  const existsQuery = (slug: string) => {
    const query = Organizer.exists({ slug });
    return session ? query.session(session) : query;
  };

  while (await existsQuery(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
    if (counter > 200) return "";
  }

  return candidate;
};

type ResolveUniqueDashboardLoginEmailArgs = {
  slug: string;
  session?: PostgresSession;
  domain?: string;
};

export const resolveUniqueDashboardLoginEmail = async ({
  slug,
  session,
  domain,
}: ResolveUniqueDashboardLoginEmailArgs) => {
  const normalizedDomain = (
    domain ||
    process.env.ORG_LOGIN_EMAIL_DOMAIN ||
    "zentra.com"
  )
    .trim()
    .toLowerCase();

  const baseLocal = generateSlug(slug);
  if (!baseLocal) return "";

  const existsQuery = (email: string) => {
    const query = DashboardUser.exists({ email });
    return session ? query.session(session) : query;
  };

  let local = baseLocal;
  let counter = 1;

  while (await existsQuery(`${local}@${normalizedDomain}`)) {
    local = `${baseLocal}-${counter}`;
    counter += 1;
    if (counter > 200) return "";
  }

  return `${local}@${normalizedDomain}`;
};
