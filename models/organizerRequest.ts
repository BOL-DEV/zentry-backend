import { createModel } from "../db/orm";

export type OrganizerRequestStatus = "pending" | "approved" | "rejected";

export interface IOrganizerRequest {
  _id: string;
  name: string;
  email: string;
  logoUrl: string;
  logoPublicId?: string | null;
  bannerUrl: string;
  bannerPublicId?: string | null;
  heroTitle: string;
  heroSubtitle: string;
  phone: string;
  about: string;
  location: string;
  bankDetails?: {
    bankName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
  };
  preferredSlug: string;
  status: OrganizerRequestStatus;
  reviewNote: string;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  createdOrganizerId?: string | null;
  createdDashboardUserId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrganizerRequest = createModel<IOrganizerRequest>({
  modelName: "OrganizerRequest",
  tableName: "organizer_requests",
  fields: {
    _id: "id",
    name: "name",
    email: "email",
    logoUrl: "logo_url",
    logoPublicId: "logo_public_id",
    bannerUrl: "banner_url",
    bannerPublicId: "banner_public_id",
    heroTitle: "hero_title",
    heroSubtitle: "hero_subtitle",
    phone: "phone",
    about: "about",
    location: "location",
    bankDetails: "bank_details",
    preferredSlug: "preferred_slug",
    status: "status",
    reviewNote: "review_note",
    approvedAt: "approved_at",
    rejectedAt: "rejected_at",
    createdOrganizerId: "created_organizer_id",
    createdDashboardUserId: "created_dashboard_user_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  relations: {
    createdOrganizerId: { modelName: "Organizer" },
    createdDashboardUserId: { modelName: "DashboardUser" },
  },
});

export default OrganizerRequest;

