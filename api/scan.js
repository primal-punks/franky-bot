// Franky Bot — endpoint cron + tombol scan manual.
// Dipanggil Vercel Cron tiap 5 menit (butuh Pro) atau manual dari dashboard.
// Akses: lolos bila CRON_SECRET cocok, ATAU session Google valid.
// Bila CRON_SECRET dan ALLOWED_EMAIL sama-sama kosong, endpoint terbuka (mode lama).

import { CONFIG } from '../lib/config.js';
import { runCycle } from '../lib/engine.js';
import { sessionFromReq, authEnabled } from '../lib/auth.js';

export default async function handler(req, res) {
  const given =
    req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
  const cronOk = Boolean(CONFIG.cronSecret) && given === CONFIG.cronSecret;
  const sessionOk = Boolean(sessionFromReq(req));
  if ((CONFIG.cronSecret || authEnabled()) && !cronOk && !sessionOk) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  try {
    const summary = await runCycle(req.query.source || 'manual');
    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
