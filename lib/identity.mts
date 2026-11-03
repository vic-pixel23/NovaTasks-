import { getIdentityConfig, getUser, type User } from '@netlify/identity';

// Fetch the full profile when the runtime only supplies JWT claims, which omit
// confirmed_at. Identity validates the session token before returning this data.
export async function verifiedIdentity(req: Request): Promise<User | null> {
 const user = await getUser();
 if (user?.confirmedAt) return user;
 const config = getIdentityConfig();
 const cookie = req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('nf_jwt='));
 let token: string | undefined;
 try { token = cookie ? decodeURIComponent(cookie.slice('nf_jwt='.length)) : config?.token; } catch { return null; }
 if (!config?.url || !token) return null;
 try {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/user`, {
   headers: { Authorization: `Bearer ${token}` },
   signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const profile = await response.json();
  if (!profile.id || !profile.email || !profile.confirmed_at || (user && profile.id !== user.id)) return null;
  return {
   id: profile.id, email: profile.email, confirmedAt: profile.confirmed_at,
   createdAt: profile.created_at,
   name: profile.user_metadata?.full_name || profile.user_metadata?.name,
   roles: Array.isArray(profile.app_metadata?.roles) ? profile.app_metadata.roles : [],
  };
 } catch { return null; }
}
