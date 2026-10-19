export type ClassNamePart = string | false | null | undefined;

export function cx(...parts: ClassNamePart[]): string {
  return parts.filter(Boolean).join(" ");
}
