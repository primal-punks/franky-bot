// Franky Bot — tukar Google ID token menjadi session bot.
// POST { idToken } -> { ok, session, email } bila email == ALLOWED_EMAIL.
// Verifikasi lewat tokeninfo Google (gratis, tanpa key).

import { makeSession } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }
  const { idToken } = req.body || {};
  const allowed = process.env.ALLOWED_EMAIL || '';
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!allowed || !clientId) {
    return res.status(400).json({ ok: false, error: 'google-login-belum-dikonfigurasi' });
  }
  if (!idToken) return res.status(400).json({ ok: false, error: 'idToken-kosong' });
  if (!process.env.SESSION_SECRET) {
    return res.status(400).json({ ok: false, error: 'SESSION_SECRET-belum-diisi' });
  }
  try {
    const info = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    ).then((r) => r.json());
    if (!info || info.error) {
      return res.status(401).json({ ok: false, error: 'token-google-tidak-valid' });
    }
    if (info.aud !== clientId) {
      return res.status(401).json({ ok: false, error: 'audience-tidak-cocok' });
    }
    if (info.email_verified !== 'true') {
      return res.status(401).json({ ok: false, error: 'email-belum-terverifikasi' });
    }
    if (String(info.email || '').toLowerCase() !== allowed.toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'email-tidak-diizinkan' });
    }
    return res.status(200).json({ ok: true, session: makeSession(info.email), email: info.email });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
