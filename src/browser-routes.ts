/** Only browser destinations owned by this app may follow authentication. */
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  ) return "/app";
  const url = new URL(value, "https://local.invalid");
  if (
    (url.pathname === "/app" || url.pathname.startsWith("/app/")) ||
    (url.pathname === "/oauth/authorize" && url.search.length > 1)
  ) return `${url.pathname}${url.search}${url.hash}`;
  return "/app";
}
