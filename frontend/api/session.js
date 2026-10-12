import authorizeSupabaseUser from '../server/supabaseAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const result = await authorizeSupabaseUser(req);
  if (!result.user) return res.status(result.status).json({ error: result.error });
  return res.status(200).json({ authenticated: true, email: result.user.email });
}