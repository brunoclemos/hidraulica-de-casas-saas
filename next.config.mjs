/** @type {import('next').NextConfig} */

// Dois alvos de build estático (output: export -> /out):
//  - GitHub Pages:  GITHUB_PAGES=true npm run build  (basePath /hidraulica-de-casas-saas)
//  - Cloudflare Pages: CLOUDFLARE=true npm run build  (serve na raiz do domínio, sem basePath)
const isGithub = process.env.GITHUB_PAGES === "true";
const isCloudflare = process.env.CLOUDFLARE === "true";
const repo = "hidraulica-de-casas-saas";

const nextConfig = {
  reactStrictMode: true,
  ...(isGithub
    ? {
        output: "export",
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : isCloudflare
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
