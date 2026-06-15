/** @type {import('next').NextConfig} */

// Build para GitHub Pages: `GITHUB_PAGES=true npm run build` gera /out estático
// servível em https://brunoclemos.github.io/hidraulica-de-casas-saas/
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "hidraulica-de-casas-saas";

const nextConfig = {
  reactStrictMode: true,
  ...(isPages
    ? {
        output: "export",
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
