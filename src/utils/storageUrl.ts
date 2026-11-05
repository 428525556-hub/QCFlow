export function buildPrivateStorageUrl(bucket: string, path: string): string {
  const query = new URLSearchParams({ bucket, path: path.replace(/^\/+/, "") });
  return `/api/storage/object?${query.toString()}`;
}
