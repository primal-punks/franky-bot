// Franky Bot — konfigurasi publik untuk dashboard.
// GOOGLE_CLIENT_ID boleh tampil di browser (itu memang dirancang publik);
// ALLOWED_EMAIL dan SESSION_SECRET TIDAK PERNAH dikirim ke sini.

export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    authEnabled: Boolean(process.env.ALLOWED_EMAIL),
  });
}
