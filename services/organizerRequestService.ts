import type { ClientSession } from "mongoose";
import Organizer from "../models/organizer";
import { generateSlug } from "../utils/slugify";

type ResolveUniqueOrganizerSlugArgs = {
  name: string;
  preferredSlug?: string;
  session?: ClientSession;
};

export const resolveUniqueOrganizerSlug = async ({
  name,
  preferredSlug,
  session,
}: ResolveUniqueOrganizerSlugArgs) => {
  const preferred = typeof preferredSlug === "string" ? preferredSlug.trim() : "";

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
