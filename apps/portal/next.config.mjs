/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    PORTAL_API_URL: process.env.PORTAL_API_URL ?? 'http://localhost:3021',
  },
};

export default nextConfig;
