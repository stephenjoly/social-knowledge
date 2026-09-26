export const libraryDomains = [
  "Travel", "Food & Drink", "Shopping & Products", "Home & Design", "Music",
  "Technology & Tools", "Learning", "Culture & Entertainment", "Health & Wellness", "Other",
] as const;

export const librarySubcategories = [
  "Restaurants", "Hotels", "Things to Do", "Nightlife", "Transportation", "Itineraries",
  "Practical Info", "Recipes", "Food Products", "Techniques", "Home & Design", "Kitchen",
  "Clothing & Accessories", "Technology", "Beauty", "Marketplace Sellers", "Discovery Tools",
  "Artists & Tracks", "Venues & Events", "DJing", "Guides", "Reference", "Other",
] as const;

export type LibraryDomain = (typeof libraryDomains)[number];
export type LibrarySubcategory = (typeof librarySubcategories)[number];

export interface LibraryClassification {
  primaryDomain: LibraryDomain;
  country: string | null;
  city: string | null;
  subcategory: LibrarySubcategory;
  secondaryTopics: string[];
  confidence: number;
}

export interface LibraryNode {
  id: string;
  parentId: string | null;
  label: string;
  slug: string;
  kind: "domain" | "country" | "city" | "subcategory";
  captureCount: number;
  childCount: number;
}

/**
 * The compact, source-attributed capture projection used to browse a library
 * node. It intentionally omits archive paths, media, transcripts, jobs, and
 * account identifiers.
 */
export interface LibraryCaptureSummary {
  id: string;
  title: string;
  platform: string;
  creator: string | null;
  creatorUrl: string | null;
  sourceUrl: string;
  synopsis: string;
  takeaways: string[];
  createdAt: string;
  assignedNode: { id: string; label: string };
  breadcrumb: Array<{ id: string; label: string }>;
}

export interface LibraryContentNode extends LibraryNode {
  breadcrumb: LibraryNode[];
  children: LibraryNode[];
  captures: LibraryCaptureSummary[];
}

export const unclassified: LibraryClassification = {
  primaryDomain: "Other", country: null, city: null, subcategory: "Other",
  secondaryTopics: [], confidence: 0,
};

export function slugifyLibraryLabel(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "other";
}
