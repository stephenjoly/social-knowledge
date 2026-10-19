import {
  ChefHat,
  Folder,
  Hammer,
  HeartPulse,
  ListChecks,
  Plane,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Category accents are data-driven, not tokens: each category label maps to an
 * icon and a colour family (see docs/design/ui-v2/pen-sources/m4_kb.js).
 */
export type KnowledgeAccent = {
  icon: string;
  tint: string;
  ink: string;
  thumb: string;
  deep: string;
};

const accents = {
  green: { icon: "#3f7a55", tint: "#e8f0ea", ink: "#2f5d40", thumb: "#e3ebe5", deep: "#cddcd2" },
  amber: { icon: "#b7791f", tint: "#fbf1df", ink: "#8a5a12", thumb: "#f1e6d6", deep: "#e7d3b8" },
  red: { icon: "#b4574f", tint: "#f8e8e6", ink: "#8c3d36", thumb: "#f0e1e1", deep: "#e4cac8" },
  blue: { icon: "#4f6fa8", tint: "#e8edf6", ink: "#3a5482", thumb: "#e1e7f0", deep: "#ccd6e6" },
  purple: { icon: "#7a5ea8", tint: "#efe9f6", ink: "#5c4482", thumb: "#e9e3f0", deep: "#d8cde6" },
  gray: { icon: "#52525b", tint: "#f1f1f2", ink: "#3f3f46", thumb: "#ececee", deep: "#dadade" },
} satisfies Record<string, KnowledgeAccent>;

const knownCategories: Array<[RegExp, LucideIcon, KnowledgeAccent]> = [
  [/health|wellness|fitness|sport|exercise/i, HeartPulse, accents.green],
  [/travel|trip|holiday/i, Plane, accents.amber],
  [/food|cook|recipe|kitchen/i, ChefHat, accents.red],
  [/productiv|work|career|study/i, ListChecks, accents.blue],
  [/financ|money|invest|budget/i, Wallet, accents.purple],
  [/home|diy|garden|house/i, Hammer, accents.gray],
];

const fallbackAccents = [
  accents.blue,
  accents.purple,
  accents.green,
  accents.amber,
  accents.red,
  accents.gray,
];

export function categoryStyle(label: string | null | undefined): {
  icon: LucideIcon;
  accent: KnowledgeAccent;
} {
  if (!label) return { icon: Folder, accent: accents.gray };
  const known = knownCategories.find(([pattern]) => pattern.test(label));
  if (known) return { icon: known[1], accent: known[2] };
  const hash = Array.from(label).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return {
    icon: Folder,
    accent: fallbackAccents[hash % fallbackAccents.length]!,
  };
}

const listThumbs = ["#f1e6d6", "#efe3d9", "#e3e8ef", "#e6ebe0", "#f2e4e0", "#e1e7f0"];

/** Placeholder thumbnail fill for list rows, which carry no media assets. */
export function thumbTint(index: number) {
  return listThumbs[index % listThumbs.length]!;
}

const hour = 60 * 60 * 1000;
const day = 24 * hour;

function calendarDaysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / day);
}

/** "5h ago", "Yesterday", "2 days ago" for compact list metadata. */
export function shortAge(iso: string, now = new Date()) {
  const then = new Date(iso);
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < hour) return `${Math.max(1, Math.floor(elapsed / 60000))}m ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`;
  const days = calendarDaysBetween(then, now);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "5 hours ago", "yesterday", "3 days ago" for running prose. */
export function longAge(iso: string, now = new Date()) {
  const then = new Date(iso);
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  const plural = (count: number, unit: string) =>
    `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (elapsed < hour) return plural(Math.max(1, Math.floor(elapsed / 60000)), "minute");
  if (elapsed < day) return plural(Math.floor(elapsed / hour), "hour");
  const days = calendarDaysBetween(then, now);
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${then.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

export function platformName(platform: string) {
  return platform ? platform.slice(0, 1).toUpperCase() + platform.slice(1) : "Source";
}

export function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed.slice(0, 1).toLocaleUpperCase() + trimmed.slice(1);
}

export function creatorHandle(creator: string | null) {
  if (!creator) return "Unknown creator";
  return creator.startsWith("@") || creator.includes(" ") ? creator : `@${creator}`;
}

/** Fired after a capture is refiled so mounted library views reload. */
export const libraryChangedEvent = "social-knowledge:library-changed";
