import type { User } from '@netlify/identity';

// JWT-derived Identity users omit confirmedAt. Ask Identity for the full record;
// never infer email verification from the presence of a session or a client flag.
export async function hasVerifiedEmail(user: User | null, req: Request, request = fetch): Promise<boolean> {
 if (!user?.email) return false;
 if (user.confirmedAt) return true;
 const token = req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('nf_jwt='))?.slice(7);
 if (!token) return false;
 try {
  const response = await request(new URL('/.netlify/identity/user', req.url), {
   headers: {Authorization: `Bearer ${decodeURIComponent(token)}`},
   signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  const record = await response.json();
  return record.id === user.id && record.email === user.email && Boolean(record.confirmed_at);
 } catch { return false; }
}
