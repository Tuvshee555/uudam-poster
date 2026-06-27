/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Node-native libs — don't bundle them on the server (napi-rs/canvas + pdfjs are
    // used to rasterize the day-program page for deterministic meal-mark reading)
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "@napi-rs/canvas", "pdfjs-dist"],
  },
};
export default nextConfig;
