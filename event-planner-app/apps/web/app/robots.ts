import type { MetadataRoute } from "next";

/**
 * Crawling is allowed **on purpose**, on a site that must not be indexed.
 *
 * That reads backwards, and it is the single thing about this setup most likely to be "fixed" into
 * being broken, so: `noindex` is served as an `X-Robots-Tag` response header (see
 * `next.config.ts`), and a crawler only ever sees a response header by **fetching the page**. A
 * `Disallow: /` here would stop it fetching, so it would never see the noindex — and a URL that
 * Google cannot crawl but has seen linked from somewhere else is exactly the one it lists as a
 * bare, description-less result. Blocking the crawler is what gets you indexed.
 *
 * The two directives are alternatives, not layers. The header is the one that works, so the
 * crawler has to be let in to read it.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
