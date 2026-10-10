import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const staticPreview = process.env.SITES_STATIC_PREVIEW === '1';
const config: NextConfig = {
  output: staticPreview ? 'export' : 'standalone',
  trailingSlash: true,
  poweredByHeader: false,
  images: {
    unoptimized: staticPreview,
    remotePatterns: [{protocol: 'https', hostname: 'res.cloudinary.com'}],
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
