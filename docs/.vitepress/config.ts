import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MOJ",
  description: "the MAPS Online Judge",
  base: "/",
  lang: "en-AU",
  appearance: "dark",
  lastUpdated: true,
  srcExclude: ["**/public/**"],
  head: [
    ["link", { rel: "icon", href: "/logo.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#2980b9" }],
  ],
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "MOJ",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Installation", link: "/guide/installation" },
      { text: "DMOJ", link: "/guide/compatibility" },
      { text: "Problems", link: "/problems/format" },
      { text: "Contests", link: "/using/contests" },
      { text: "API", link: "/reference/api" },
      { text: "Source", link: "https://github.com/MonashAPS/MOJ" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Installation", link: "/guide/installation" },
          { text: "Production", link: "/guide/production" },
          { text: "Compatibility with DMOJ", link: "/guide/compatibility" },
        ],
      },
      {
        text: "Using the judge",
        items: [
          { text: "Problems", link: "/using/problems" },
          { text: "Contests", link: "/using/contests" },
          { text: "Accounts and 2FA", link: "/using/accounts" },
          { text: "Feeds", link: "/using/feeds" },
        ],
      },
      {
        text: "Authoring problems",
        items: [
          { text: "Problem format", link: "/problems/format" },
          { text: "Problem repos and CI", link: "/problems/repos-and-ci" },
        ],
      },
      {
        text: "Running a site",
        items: [
          { text: "Staff console", link: "/admin/staff-console" },
          { text: "Importing from DMOJ", link: "/admin/import" },
          { text: "Proctoring", link: "/admin/proctoring" },
          { text: "Troubleshooting", link: "/admin/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API", link: "/reference/api" },
          { text: "Architecture", link: "/reference/architecture" },
          { text: "Development", link: "/reference/development" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/MonashAPS/MOJ" }],
    outline: [2, 3],
    editLink: {
      pattern: "https://github.com/MonashAPS/MOJ/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the AGPL-3.0-only licence.",
      copyright: "Run your own: every page here is written for an operator, not for one site.",
    },
    docFooter: {
      prev: "Previous page",
      next: "Next page",
    },
  },
});
