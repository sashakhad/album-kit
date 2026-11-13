/**
 * Player media: same-origin files, blob uploads, and Suno CDN MP3/MP4 (`https://cdnN.suno.ai`).
 * Looking up a clip on studio-api.prod.suno.com is a server fetch, so it is not a browser connect source.
 */
export const CONTENT_SECURITY_POLICY = "media-src 'self' blob: https://*.suno.ai";
