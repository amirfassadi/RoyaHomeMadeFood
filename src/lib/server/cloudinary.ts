import 'server-only';
import {v2 as cloudinary} from 'cloudinary';
import {ShopError} from './shop-http';
export function mediaUploadsEnabled() {
  return process.env.ROYA_MEDIA_UPLOADS_ENABLED !== '0' &&
    ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'].every(key=>Boolean(process.env[key]?.trim()));
}
export function getCloudinary() {
  if (!mediaUploadsEnabled()) throw new ShopError('MEDIA_UPLOADS_DISABLED',503);
  const {CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret} = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error('Cloudinary credentials are required for media operations');
  cloudinary.config({cloud_name, api_key, api_secret, secure: true});
  return cloudinary;
}
