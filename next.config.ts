import type {NextConfig} from 'next';
import {securityHeaders} from './src/lib/security';
import createNextIntlPlugin from 'next-intl/plugin';
const staticPreview = process.env.SITES_STATIC_PREVIEW === '1';
const config: NextConfig = {
  output: staticPreview ? 'export' : 'standalone',
  trailingSlash: true,
  pageExtensions: staticPreview ? ['tsx'] : ['ts', 'tsx'],
  poweredByHeader: false,
  ...(!staticPreview?{async headers(){return [{source:'/((?!_next/static).*)',headers:securityHeaders(process.env.NODE_ENV==='production')},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]}];}}:{}),
  images: {
    unoptimized: staticPreview,
    remotePatterns: [{protocol: 'https', hostname: 'res.cloudinary.com'}],
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
