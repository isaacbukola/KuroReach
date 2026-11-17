export async function safeFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (
    trimmed.startsWith('<') ||
    (!contentType.includes('application/json') && !trimmed.startsWith('{') && !trimmed.startsWith('['))
  ) {
    throw new Error(
      res.status >= 500
        ? `Gateway timeout or temporary server interruption (HTTP ${res.status}). Retry in a moment.`
        : `Endpoint returned an HTML page instead of JSON (HTTP ${res.status}). Reload the workspace and sign in again if needed.`
    );
  }

  let parsed: T & { error?: string };
  try {
    parsed = JSON.parse(rawText) as T & { error?: string };
  } catch {
    throw new Error(`Invalid JSON response from server (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(parsed?.error || `Request failed with HTTP ${res.status}`);
  }

  return parsed;
}
