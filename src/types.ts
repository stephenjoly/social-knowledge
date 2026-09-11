export const jobStatuses = [
  "queued",
  "downloading",
  "processing",
  "transcribing",
  "translating",
  "analyzing",
  "writing",
  "complete",
  "failed",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export interface JobRecord {
  id: string;
  ownerUserId: string;
  sourceUrl: string;
  normalizedUrl: string;
  displayTitle: string | null;
  sourceHash: string;
  userNote: string | null;
  status: JobStatus;
  attempts: number;
  error: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  resultNotePath: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  aiProvider?: "openai" | "cerebras" | null;
}

export type SourceType = "video" | "image" | "carousel" | "mixed";
export type AssetKind = "video" | "audio" | "image" | "thumbnail";

export interface AssetRecord {
  id: string;
  captureId: string;
  kind: AssetKind;
  path: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
}

export interface CaptureRecord {
  id: string;
  ownerUserId: string;
  jobId: string;
  sourceHash: string;
  sourceUrl: string;
  platform: string;
  sourceType: SourceType;
  sourceId: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  description: string | null;
  transcript: string;
  sourceLanguage: string | null;
  translatedTranscript: string | null;
  translationLanguage: string | null;
  comments: SocialComment[];
  synopsis: string;
  whyUseful: string | null;
  analysis: AnalysisResult;
  topics: string[];
  entities: ExtractedEntity[];
  publishedAt: string | null;
  durationSeconds: number | null;
  notePath: string;
  createdAt: string;
  assets: AssetRecord[];
}

export interface DownloadMetadata {
  id: string;
  platform: string;
  title: string | null;
  description: string | null;
  uploader: string | null;
  uploaderUrl: string | null;
  webpageUrl: string;
  uploadDate: string | null;
  durationSeconds: number | null;
  comments: SocialComment[];
}

export interface SocialComment {
  author: string | null;
  text: string;
  likeCount: number | null;
  isPinned: boolean;
}

export interface DownloadResult {
  workDir: string;
  videoPath: string;
  thumbnailPath: string | null;
  metadata: DownloadMetadata;
}

export interface ProcessedMedia extends DownloadResult {
  audioPath: string;
  framePaths: string[];
}

export interface EvidenceItem {
  claim: string;
  source: "transcript" | "description" | "frame" | "comment";
  timestampSeconds: number | null;
  quote: string | null;
}

export interface ExtractedEntity {
  name: string;
  type:
    "place" | "restaurant" | "product" | "person" | "organization" | "other";
  location: string | null;
  description: string | null;
  confidence: number;
}

export interface AnalysisResult {
  title: string;
  synopsis: string;
  whyUseful: string | null;
  takeaways: string[];
  topics: string[];
  entities: ExtractedEntity[];
  recommendations: string[];
  claimsNeedingVerification: string[];
  evidence: EvidenceItem[];
  classification: LibraryClassification;
}

export interface VaultWriteInput {
  job: JobRecord;
  media: ProcessedMedia;
  transcript: string;
  sourceLanguage: string | null;
  translatedTranscript: string | null;
  translationLanguage: string | null;
  analysis: AnalysisResult;
  archivedVideoPath: string;
  archivedAudioPath: string;
  archivedThumbnailPath: string | null;
}
import type { LibraryClassification } from "./library.js";
