export type MediaKind = "photo" | "video";
export type MediaStatus = "pending" | "approved" | "rejected";

export type SiteInfo = {
  couple: string;
  date: string;
  dateLabel: string;
  tagline: string;
  setupRequired: boolean;
  approvedCount: number;
  limits: {
    photoMb: number;
    videoMb: number;
    filesPerUpload: number;
    maxVideoSeconds: number;
  };
};

export type MediaItem = {
  id: string;
  kind: MediaKind;
  mime: string;
  guestName: string;
  caption: string;
  createdAt: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  status?: MediaStatus;
  originalName?: string;
  rejectReason?: string;
  reviewedAt?: string | null;
  previewToken?: string;
};

export type Stats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  bytes: number;
  diskBytes: number;
  recent: { id: string; action: string; mediaId: string; detail: string; createdAt: string }[];
};
