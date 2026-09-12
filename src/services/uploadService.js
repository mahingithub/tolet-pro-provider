/**
 * uploadService.js — signed direct-to-Cloudinary upload.
 * ──────────────────────────────────────────────────────────────────────────
 * The file bytes never touch the To-Let Pro server. We ask it for a one-time
 * signature, then POST the image straight to Cloudinary. That keeps server
 * memory flat no matter how many shopfront photos are uploading at once, and
 * it means a slow upload on a 2G connection is between the phone and
 * Cloudinary rather than holding one of our request handlers open.
 *
 * Mirrors the public app's approach against the same endpoints
 * (routes/upload.routes.js).
 */

import { apiFetch } from './apiClient.js';

/**
 * Upload one image and return { url, publicId }.
 *
 * @param {File} file
 * @param {string} folder  Cloudinary folder, e.g. 'providers/photos'
 * @param {(pct:number)=>void} [onProgress]
 */
export async function uploadImage(file, folder, onProgress) {
  const sig = await apiFetch('/upload/signature', {
    method: 'POST',
    body: { folder },
  });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', sig.timestamp);
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  if (sig.publicId) form.append('public_id', sig.publicId);

  const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType || 'image'}/upload`;

  // XHR rather than fetch: upload progress is the difference between a
  // shopkeeper waiting patiently on a slow connection and one who assumes the
  // app has frozen and force-closes it mid-registration.
  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error?.message || 'আপলোড ব্যর্থ হয়েছে।'));
      } catch {
        reject(new Error('আপলোড ব্যর্থ হয়েছে।'));
      }
    };
    xhr.onerror = () => reject(new Error('ইন্টারনেট সংযোগে সমস্যা হচ্ছে।'));
    xhr.send(form);
  });

  return { url: result.secure_url, publicId: result.public_id };
}
