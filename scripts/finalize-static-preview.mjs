import {writeFile} from 'node:fs/promises';
if(process.env.SITES_STATIC_PREVIEW!=='1')throw new Error('Static preview flag required');
await writeFile('out/robots.txt','User-agent: *\nDisallow: /\n');
await writeFile('out/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
