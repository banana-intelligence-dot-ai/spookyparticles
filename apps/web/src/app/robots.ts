import type { MetadataRoute } from "next";

/** Public pages are open to every crawler, including AI answer engines. Signed-in and API routes are not pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/dev"] }],
    sitemap: "https://spookyparticles.com/sitemap.xml",
  };
}
