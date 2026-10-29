import type {NextConfig} from 'next';
import {securityHeaders} from './src/lib/security';
import createNextIntlPlugin from 'next-intl/plugin';
const staticPreview = process.env.SITES_STATIC_PREVIEW === '1';
const config: NextConfig = {
  output: staticPreview ? 'export' : 'standalone',
  trailingSlash: true,
  // Keep API .ts routes out of static exports; multiple extensions also avoid
  // Webpack serializing a single extension as a string in its app loader.
  pageExtensions: staticPreview ? ['tsx', 'jsx'] : ['ts', 'tsx'],
  poweredByHeader: false,
  ...(!staticPreview?{async redirects(){return [{source:'/',destination:'/fa/',permanent:true}];}}:{}),
  ...(!staticPreview?{async headers(){return [{source:'/((?!_next/static).*)',headers:securityHeaders(process.env.NODE_ENV==='production')},{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]}];}}:{}),
  images: {
    unoptimized: staticPreview,
    remotePatterns: [{protocol: 'https', hostname: 'res.cloudinary.com'}],
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
