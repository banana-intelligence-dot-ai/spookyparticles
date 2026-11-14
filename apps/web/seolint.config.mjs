// SEO check on the public pages of the production build. Errors fail the build; warnings only print.
export default {
  host: "https://spookyparticles.com",
  inputs: [".next/server/app"],
  ignore: [
    "_*.html",         // Next.js error shells, not pages
    "app.html",        // the signed-in app, not a search page
    "app/**",
    "dev/**",          // design previews, not public
    "link.html",       // agent sign-in approve page, signed in only
    "how/?slug?.html", // the route template; the real how pages are checked
  ],
  rules: {
    // These are served by route handlers, so they are not files in the build folder.
    "site.link.exists": { ignore: ["/setup.md", "/skill.md", "/llms.txt"] },
    "site.robots": false,   // src/app/robots.ts
    "site.sitemap": false,  // src/app/sitemap.ts
  },
};
