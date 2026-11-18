/**
 * Player media: same-origin files, blob uploads, and Suno CDN MP3/MP4 (`https://cdnN.suno.ai`).
 * Looking up a clip on studio-api.prod.suno.com is a server fetch, so it is not a browser connect source.
 */
export const CONTENT_SECURITY_POLICY = "media-src 'self' blob: https://*.suno.ai";

/**
 * Standalone Open Album.html policy.
 *
 * A sandboxed HTML viewer often sets `media-src blob: data:` and `connect-src https:`.
 * Direct `<video src="https://cdnN.suno.ai/...mp4">` is then rejected with
 * MediaError 4, "Media load rejected by URL safety check". The page policy is
 * intersected with the viewer's, so this document must allow the CDN on
 * `connect-src` and `blob:` on `media-src`. `connect-src 'self'` blocks that
 * fetch when the attachment origin is opaque.
 */
export const PLAYER_SHELL_CSP =
  "default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https://*.suno.ai; media-src 'self' blob: data: file: https://*.suno.ai; base-uri 'none'; form-action 'none'";
