export async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(body.error || body.message || "Request failed"),
      { status: response.status, body },
    );
  return body as T;
}
export const assetUrl = (captureId: string, assetId: string) =>
  `/api/v1/captures/${captureId}/assets/${assetId}`;
