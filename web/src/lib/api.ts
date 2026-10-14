/** One agent line. `text` is the line in the caller's language when the server provides it. */
export type VoiceLine = { te: string; en: string; text?: string };

export type VoiceReply = {
  sessionId?: string;
  /** What the caller said (speech-to-text or typed). */
  said?: string;
  /** Agent lines: Telugu + English subtitle. */
  reply: VoiceLine[];
  /** base64 WAV per reply line, same order (null when TTS failed). */
  audios: (string | null)[];
  done?: boolean;
  fields?: Record<string, any>;
  captured?: Record<string, any>;
  preview?: any;
  result?: any;
  timing?: { sttMs?: number; aiMs?: number };
  engine?: string;
};

/**
 * Fetch JSON from the API. POST when a body is given, otherwise GET.
 * Throws Error(message) with the server's `{ error }` text on failure.
 */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { method: "GET", headers: { Accept: "application/json" } }
      : { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) };
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error("Network error. Please check your connection and try again.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
  return data as T;
}
