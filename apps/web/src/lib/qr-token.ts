function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function lastPathSegment(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const slash = withoutQuery.lastIndexOf("/");
  return safeDecode(slash >= 0 ? withoutQuery.slice(slash + 1) : withoutQuery);
}

export function extractQrToken(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  try {
    return lastPathSegment(new URL(trimmed).pathname);
  } catch {
    return lastPathSegment(trimmed);
  }
}
