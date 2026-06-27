import { createModel } from "../db/orm";

export interface IOrganizer {
  _id: string;
  name: string;
  slug: string;
  logoUrl: string;
  logoPublicId?: string | null;
  bannerUrl: string;
  bannerPublicId?: string | null;
  heroTitle: string;
  heroSubtitle: string;
  about: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  bankDetails?: {
    bankName?: string | null;
    bankCode?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } | null;
  staffSessionLimit: number;
  organizerSessionLimit: number;
  platformFeeOverride?: {
    flatFeeBelowThreshold?: number | null;
    thresholdAmount?: number | null;
    percentAboveThreshold?: number | null;
  } | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const Organizer = createModel<IOrganizer>({
  modelName: "Organizer",
  tableName: "organizers",
  fields: {
    _id: "id",
    name: "name",
    slug: "slug",
    logoUrl: "logo_url",
    logoPublicId: "logo_public_id",
    bannerUrl: "banner_url",
    bannerPublicId: "banner_public_id",
    heroTitle: "hero_title",
    heroSubtitle: "hero_subtitle",
    about: "about",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    location: "location",
    bankDetails: "bank_details",
    staffSessionLimit: "staff_session_limit",
    organizerSessionLimit: "organizer_session_limit",
    platformFeeOverride: "platform_fee_override",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
});

export default Organizer;

