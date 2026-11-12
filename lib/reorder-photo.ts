import sharp from 'sharp';
import {fileType} from './upload-validation';

const maxPixels = 36_000_000;

export async function reorderPhotoJpeg(bytes: Uint8Array) {
 const render = (image: ReturnType<typeof sharp>) => image
  .resize({width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true})
  .flatten({background: '#ffffff'})
  .jpeg({quality: 86})
  .toBuffer();

 try {
  return await render(sharp(bytes, {limitInputPixels: maxPixels}).autoOrient());
 } catch (error) {
  if (fileType(bytes, 'issue') !== 'image/heic') throw error;
 }

 const {default: decode} = await import('heic-decode');
 const images = await decode.all({buffer: bytes});
 try {
  const image = images[0];
  if (!image || image.width * image.height > maxPixels) throw Error('Unsupported photo dimensions.');
  const {data, width, height} = await image.decode();
  return await render(sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
   raw: {width, height, channels: 4},
  }));
 } finally {
  images.dispose();
 }
}
