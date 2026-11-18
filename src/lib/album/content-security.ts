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
 * MediaError 4, "Media load rejected by URL safety check". The real Grok viewer
 * also rejects `fetch()` to that CDN, so a blob built at view time cannot load.
 * Open Album.html therefore inlines the public bytes at export and plays
 * `blob:` or the bytes already in the file. `blob:` and `data:` stay on
 * `media-src` for that playback. `connect-src` still names the CDN for a normal
 * browser that can stream it directly.
 */
export const PLAYER_SHELL_CSP =
  "default-src 'none'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https://*.suno.ai; media-src 'self' blob: data: file: https://*.suno.ai; base-uri 'none'; form-action 'none'";
