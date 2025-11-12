// api/files.js
import { get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');

  try {
    const metaBlob = await get('quickinfo-files.json'); // same name used in upload.js
    if (!metaBlob) return res.status(200).json([]);
    const raw = await metaBlob.arrayBuffer();
    const text = Buffer.from(raw).toString();
    const json = JSON.parse(text || '[]');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(json);
  } catch (err) {
    console.error('files read error', err);
    return res.status(500).json({ error: err.message || 'Could not read files' });
  }
}
