/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdf-parse / mammoth are node libs — don't bundle them on the server
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "pdf-lib"],
  },
};
export default nextConfig;
