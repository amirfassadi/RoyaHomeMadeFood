import 'server-only';
import {v2 as cloudinary} from 'cloudinary';
export function getCloudinary() {
  const {CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret} = process.env;
  if (!cloud_name || !api_key || !api_secret) throw new Error('Cloudinary credentials are required for media operations');
  cloudinary.config({cloud_name, api_key, api_secret, secure: true});
  return cloudinary;
}
