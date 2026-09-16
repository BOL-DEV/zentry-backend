import { Types } from "mongoose";
import GalleryReaction from "../models/galleryReaction";

export const getLikeCounts = async (
  galleryItemIds: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (!galleryItemIds.length) return counts;

  const objectIds = galleryItemIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const results = await GalleryReaction.aggregate<{
    _id: Types.ObjectId;
    count: number;
  }>([
    { $match: { galleryItemId: { $in: objectIds } } },
    { $group: { _id: "$galleryItemId", count: { $sum: 1 } } },
  ]);

  for (const row of results) {
    counts.set(row._id.toString(), row.count);
  }

  return counts;
};

export const getLikedItemIds = async (
  ipAddress: string,
  galleryItemIds: string[],
): Promise<Set<string>> => {
  const liked = new Set<string>();
  if (!ipAddress || !galleryItemIds.length) return liked;

  const objectIds = galleryItemIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const reactions = await GalleryReaction.find({
    ipAddress,
    galleryItemId: { $in: objectIds },
  })
    .select("galleryItemId")
    .lean();

  for (const reaction of reactions) {
    liked.add(reaction.galleryItemId.toString());
  }

  return liked;
};

export const recordLike = async (
  galleryItemId: string,
  ipAddress: string,
): Promise<void> => {
  if (!ipAddress || !Types.ObjectId.isValid(galleryItemId)) return;

  await GalleryReaction.updateOne(
    { galleryItemId, ipAddress },
    { $setOnInsert: { galleryItemId, ipAddress } },
    { upsert: true },
  );
};
