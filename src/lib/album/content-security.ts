/** Lets the player load curation MP3s from the Suno CDN. Other fetches stay unrestricted. */
export const CONTENT_SECURITY_POLICY = "media-src 'self' blob: https://*.suno.ai";
