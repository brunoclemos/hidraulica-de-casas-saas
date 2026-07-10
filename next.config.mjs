/** @type {import('next').NextConfig} */

// Build para GitHub Pages: `GITHUB_PAGES=true npm run build` gera /out estático
// servível em https://brunoclemos.github.io/hidraulica-de-casas-saas/
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "hidraulica-de-casas-saas";

const nextConfig = {
  reactStrictMode: true,
  // exposto ao cliente p/ montar URLs de assets estáticos (ex.: planilha em public/)
  env: { NEXT_PUBLIC_BASE_PATH: isPages ? `/${repo}` : "" },
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
