// api/upload.js
import Busboy from 'busboy';
import { put, get, list } from '@vercel/blob';
import { Readable } from 'stream';

const FILES_JSON_BLOB_NAME = 'quickinfo-files.json'; // metadata file stored in Blob

export const config = {
  api: { bodyParser: false } // Let Busboy handle parsing
};

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  try {
    const busboy = new Busboy({ headers: req.headers });
    const files = [];
    let courseId = '';

    await new Promise((resolve, reject) => {
      busboy.on('file', async (fieldname, fileStream, filename, encoding, mimetype) => {
        try {
          const buffer = await streamToBuffer(fileStream);
          files.push({ filename, buffer, mimetype });
        } catch (err) {
          reject(err);
        }
      });

      busboy.on('field', (name, val) => {
        if (name === 'courseId') courseId = val;
      });

      busboy.on('finish', resolve);
      busboy.on('error', reject);
      req.pipe(busboy);
    });

    if (!courseId) return res.status(400).json({ error: 'Missing courseId' });
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    // Upload each file to Blob (public)
    const uploaded = [];
    for (const f of files) {
      // put returns the public URL when access: 'public'
      const blobKey = `courses/${courseId}/${Date.now()}-${f.filename}`;
      const putRes = await put(blobKey, f.buffer, { access: 'public', contentType: f.mimetype });
      // putRes.url or putRes?.href depending on SDK version
      const blobUrl = putRes.url || putRes.href || putRes; // fallback
      uploaded.push({ name: f.filename, blobUrl, mimetype: f.mimetype });
    }

    // Load existing metadata file (files.json) if present
    let meta = [];
    try {
      const metaBlob = await get(FILES_JSON_BLOB_NAME);
      if (metaBlob) {
        const raw = await metaBlob.arrayBuffer();
        const text = Buffer.from(raw).toString();
        meta = JSON.parse(text || '[]');
      }
    } catch (e) {
      // if not found, start with empty array
      meta = [];
    }

    // Append uploaded metadata entries
    const now = Date.now();
    for (const u of uploaded) {
      meta.push({
        id: 'f_' + Math.random().toString(36).slice(2,9),
        courseId,
        name: u.name,
        blobUrl: u.blobUrl,
        type: u.mimetype,
        uploadedAt: now
      });
    }

    // Save updated metadata back to the blob
    const metaBuffer = Buffer.from(JSON.stringify(meta, null, 2));
    await put(FILES_JSON_BLOB_NAME, metaBuffer, { access: 'public', contentType: 'application/json' });

    return res.status(200).json({ success: true, uploaded: uploaded.length });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
}
