import type { User } from '@netlify/identity';

// Functions may receive the session cookie without the library's global context.
// Validate it with Identity rather than decoding or trusting client-supplied claims.
export async function readRequestIdentity(req: Request, request = fetch): Promise<User | null> {
 const value = req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('nf_jwt='))?.slice(7);
 if (!value) return null;
 let token: string;
 try { token=decodeURIComponent(value); } catch { return null; }
 const response=await request(new URL('/.netlify/identity/user',req.url),{
  headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000),redirect:'error',
 });
 if(response.status===401||response.status===403)return null;
 if(!response.ok)throw Error('Identity lookup unavailable.');
 const record=await response.json();
 if(typeof record.id!=='string'||!record.id||typeof record.email!=='string'||!record.email)throw Error('Invalid Identity response.');
 return {
  id:record.id,email:record.email,
  confirmedAt:typeof record.confirmed_at==='string'&&record.confirmed_at?record.confirmed_at:undefined,
  name:typeof record.user_metadata?.full_name==='string'?record.user_metadata.full_name:undefined,
  createdAt:record.created_at,
  roles:Array.isArray(record.app_metadata?.roles)?record.app_metadata.roles.filter((role:unknown)=>typeof role==='string'):[],
 };
}
