import { query } from "../db/pg";

export const getLikeCounts = async (
  galleryItemIds: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (!galleryItemIds.length) return counts;

  const result = await query<{ gallery_item_id: string; count: string }>(
    `SELECT gallery_item_id, COUNT(*)::int AS count
     FROM gallery_reactions
     WHERE gallery_item_id = ANY($1)
     GROUP BY gallery_item_id`,
    [galleryItemIds],
  );

  for (const row of result.rows) {
    counts.set(row.gallery_item_id, Number(row.count));
  }

  return counts;
};

export const getLikedItemIds = async (
  ipAddress: string,
  galleryItemIds: string[],
): Promise<Set<string>> => {
  const liked = new Set<string>();
  if (!ipAddress || !galleryItemIds.length) return liked;

  const result = await query<{ gallery_item_id: string }>(
    `SELECT gallery_item_id FROM gallery_reactions
     WHERE ip_address = $1 AND gallery_item_id = ANY($2)`,
    [ipAddress, galleryItemIds],
  );

  for (const row of result.rows) {
    liked.add(row.gallery_item_id);
  }

  return liked;
};

export const recordLike = async (
  galleryItemId: string,
  ipAddress: string,
): Promise<void> => {
  await query(
    `INSERT INTO gallery_reactions (id, gallery_item_id, ip_address, created_at)
     VALUES (gen_random_uuid()::text, $1, $2, NOW())
     ON CONFLICT (gallery_item_id, ip_address) DO NOTHING`,
    [galleryItemId, ipAddress],
  );
};
