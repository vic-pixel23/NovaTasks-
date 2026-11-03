import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import handler from '../netlify/functions/api.mts';

test('API rejects unsupported methods, cross-origin mutations, and unauthenticated reads', async () => {
 const unsupported=await handler(new Request('https://example.test/api/me',{method:'DELETE'}));assert.equal(unsupported.status,405);
 const cross=await handler(new Request('https://example.test/api/withdraw',{method:'POST',headers:{Origin:'https://other.test'}}));assert.equal(cross.status,403);
 for(const route of ['me','admin']){const response=await handler(new Request('https://example.test/api/'+route));assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');}
});
test('generated migration creates the schema and enforces financial constraints', async () => {
 const db=new PGlite();
 try{
 const root='netlify/database/migrations';for(const name of (await readdir(root)).sort())await db.exec(await readFile(`${root}/${name}/migration.sql`,'utf8'));
 const tables=await db.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.deepEqual(tables.rows.map(r=>r.tablename).sort(),['audit_logs','rewards','submissions','tasks','users','withdrawals']);
 await assert.rejects(db.exec("INSERT INTO tasks(title,description,kind,reward_kobo,slots) VALUES('','','task',-1,1)"),/task_money/);
 await assert.rejects(db.exec("INSERT INTO tasks(title,description,kind,reward_kobo,slots) VALUES('','','task',100,-1)"),/task_slots/);
 const constraints=await db.query<{conname:string}>("SELECT conname FROM pg_constraint WHERE contype IN ('u','c')");const names=constraints.rows.map(r=>r.conname);
 for(const name of ['rewards_submission_id_key','withdrawal_amount','withdrawal_status','reward_status','submission_status'])assert.ok(names.includes(name),name);
 const indices=await db.query<{indexname:string}>("SELECT indexname FROM pg_indexes WHERE schemaname='public'");for(const name of ['one_submission_per_user_task','withdrawal_idempotency'])assert.ok(indices.rows.some(r=>r.indexname===name));
 }finally{await db.close();}
});

test('API recognizes request-cookie sessions without Identity global context',async()=>{
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({id:'existing-user',email:'owner@example.test'});
  const unconfirmed=await handler(new Request('https://example.test/api/me',{headers:{cookie:'nf_jwt=test-session'}}));
  assert.equal(unconfirmed.status,403);assert.match((await unconfirmed.json()).error,/email address is not confirmed/);
  globalThis.fetch=async()=>new Response(null,{status:401});
  const expired=await handler(new Request('https://example.test/api/me',{headers:{cookie:'nf_jwt=test-session'}}));
  assert.equal(expired.status,401);assert.match((await expired.json()).error,/session is missing or expired/);
  globalThis.fetch=async()=>{throw Error('offline');};
  const unavailable=await handler(new Request('https://example.test/api/me',{headers:{cookie:'nf_jwt=test-session'}}));
  assert.equal(unavailable.status,503);assert.doesNotMatch((await unavailable.json()).error,/verified email/);
 }finally{globalThis.fetch=originalFetch;}
});
