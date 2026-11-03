import { getUser } from '@netlify/identity';
import { hasVerifiedEmail } from './verified-user.js';
import { getDatabase } from '@netlify/database';
import { eq, desc } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { users, tasks, submissions, rewards, withdrawals, auditLogs } from '../../db/schema.js';
import type { Config } from '@netlify/functions';
class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
function fail(status:number,message:string):never{throw new HttpError(status,message);}
function text(v:unknown,max:number){if(typeof v!=='string'||!v.trim()||v.length>max)fail(400,'Invalid text field.');return v.trim();}
function amount(v:unknown){if(typeof v!=='string' || !/^\d+(\.\d{1,2})?$/.test(v))fail(400,'Enter a valid NGN amount with at most two decimal places.');const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<1||n>1000000000)fail(400,'Amount out of range.');return n;}
function uuid(v:unknown){if(typeof v!=='string'||!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v))fail(400,'Invalid record ID.');return v;}
export default async (req:Request) => {
 try {
  if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
  if(req.method==='POST' && req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Invalid request origin.');
  const identity=await getUser();
  if(!identity||!await hasVerifiedEmail(identity,req))fail(401,'Sign in with a verified email address.');
  const db=database();
  const role=identity.roles?.includes('admin')?'admin':'member';
  await db.insert(users).values({id:identity.id,email:identity.email!,fullName:identity.name||identity.email!,registeredAt:identity.createdAt?new Date(identity.createdAt):new Date(),role}).onConflictDoUpdate({target:users.id,set:{email:identity.email!,role}});
  const [actor]=await db.select().from(users).where(eq(users.id,identity.id));
  if(actor.status!=='active')fail(403,'This account is suspended.');
  const path=new URL(req.url).pathname.replace(/^\/api\/?/,'');
  if(path.startsWith('admin')&&role!=='admin')fail(403,'Administrator access required.');
  if(req.method==='GET') {
   if(path==='me'){
    const [mine,ledger,payouts,available]=await Promise.all([db.select().from(submissions).where(eq(submissions.userId,actor.id)).orderBy(desc(submissions.createdAt)),db.select().from(rewards).where(eq(rewards.userId,actor.id)).orderBy(desc(rewards.transactionAt)),db.select().from(withdrawals).where(eq(withdrawals.userId,actor.id)).orderBy(desc(withdrawals.requestedAt)),db.select().from(tasks).where(eq(tasks.status,'published'))]);
    const earned=ledger.reduce((s,r)=>s+r.amountKobo,0);const reserved=payouts.filter(w=>w.status!=='rejected').reduce((s,w)=>s+w.amountKobo,0);
    return reply({user:actor,submissions:mine,rewards:ledger,withdrawals:payouts,tasks:available,balanceKobo:earned-reserved});
   }
   if(path==='admin'){
    const [allUsers,allTasks,allSubmissions,allWithdrawals,ledger,audit]=await Promise.all([db.select().from(users),db.select().from(tasks),db.select().from(submissions),db.select().from(withdrawals),db.select().from(rewards),db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100)]);
    return reply({users:allUsers,tasks:allTasks,submissions:allSubmissions,withdrawals:allWithdrawals,audit,statistics:{users:allUsers.length,activeUsers:allUsers.filter(u=>u.status==='active').length,tasks:allTasks.length,pendingSubmissions:allSubmissions.filter(s=>s.status==='pending').length,earnedKobo:ledger.reduce((s,r)=>s+r.amountKobo,0),paidKobo:allWithdrawals.filter(w=>w.status==='paid').reduce((s,w)=>s+w.amountKobo,0),reservedKobo:allWithdrawals.filter(w=>['pending','approved'].includes(w.status)).reduce((s,w)=>s+w.amountKobo,0)}});
   }
   fail(404,'Endpoint not found.');
  }
  if(Number(req.headers.get('content-length')||0)>20000)fail(413,'Request too large.');
  const raw=await req.text();if(raw.length>20000)fail(413,'Request too large.');
  let b:any;try{b=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'Invalid request.');
  const client=await getDatabase().pool.connect();
  try {
   await client.query('BEGIN');
   // Every money mutation locks the beneficiary user before reading their ledger.
   // Lock the actor as well so a concurrent suspension cannot slip past authorization.
   const locked=await client.query('SELECT status FROM users WHERE id=$1 FOR UPDATE',[actor.id]);
   if(locked.rows[0]?.status!=='active')fail(403,'This account is suspended.');
   let result:any;
   if(path==='submit'){
    const taskId=uuid(b.taskId),proof=text(b.proof,5000);
    const t=await client.query('SELECT * FROM tasks WHERE id=$1 FOR UPDATE',[taskId]);
    if(!t.rows[0]||t.rows[0].status!=='published'||t.rows[0].slots<1)fail(409,'Task unavailable or full.');
    result=await client.query('INSERT INTO submissions(user_id,task_id,proof,reward_kobo) VALUES($1,$2,$3,$4) RETURNING *',[actor.id,taskId,proof,t.rows[0].reward_kobo]);
    await client.query('UPDATE tasks SET slots=slots-1 WHERE id=$1',[taskId]);
   } else if(path==='withdraw'){
    const n=amount(b.amount),details=text(b.paymentDetails,1000),key=uuid(b.requestKey);
    const existing=await client.query('SELECT * FROM withdrawals WHERE user_id=$1 AND request_key=$2',[actor.id,key]);
    if(existing.rows.length){result=existing;}else{
     const balance=await client.query("SELECT COALESCE((SELECT SUM(amount_kobo) FROM rewards WHERE user_id=$1),0)-COALESCE((SELECT SUM(amount_kobo) FROM withdrawals WHERE user_id=$1 AND status <> 'rejected'),0) AS amount",[actor.id]);
     if(Number(balance.rows[0].amount)<n)fail(409,'Insufficient available balance.');
     result=await client.query('INSERT INTO withdrawals(user_id,amount_kobo,payment_details,request_key) VALUES($1,$2,$3,$4) RETURNING *',[actor.id,n,details,key]);
    }
   } else if(path==='admin/task'){
    if(b.id){
     const id=uuid(b.id);if(!['published','paused','closed'].includes(b.status))fail(400,'Invalid task status.');
     result=await client.query('UPDATE tasks SET status=$1 WHERE id=$2 RETURNING *',[b.status,id]);
    }else{
     if(!Number.isInteger(b.slots)||b.slots<1||b.slots>100000)fail(400,'Invalid slots.');
     if(!['task','survey'].includes(b.kind))fail(400,'Invalid task type.');
     result=await client.query('INSERT INTO tasks(title,description,kind,reward_kobo,slots) VALUES($1,$2,$3,$4,$5) RETURNING *',[text(b.title,100),text(b.description,5000),b.kind,amount(b.reward),b.slots]);
    }
   } else if(path==='admin/user'){
    const id=uuid(b.id);if(id===actor.id)fail(400,'You cannot suspend your own account.');
    if(!['active','suspended'].includes(b.status))fail(400,'Invalid account status.');
    result=await client.query('UPDATE users SET status=$1 WHERE id=$2 RETURNING *',[b.status,id]);
   } else if(path==='admin/submission'||path==='admin/withdrawal'){
    const id=uuid(b.id),table=path.endsWith('submission')?'submissions':'withdrawals';
    const found=await client.query(`SELECT user_id FROM ${table} WHERE id=$1`,[id]);if(!found.rows.length)fail(404,'Record not found.');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[found.rows[0].user_id]);
    const foundLocked=await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);const record=foundLocked.rows[0];
    if(table==='submissions'){
     if(record.status!=='pending'||!['approved','rejected'].includes(b.status))fail(409,'Submission already reviewed or invalid decision.');
     if(b.status==='approved')await client.query('INSERT INTO rewards(user_id,amount_kobo,submission_id) VALUES($1,$2,$3)',[record.user_id,record.reward_kobo,id]);
     else await client.query('UPDATE tasks SET slots=slots+1 WHERE id=$1',[record.task_id]);
    }else{
     const allowed:Record<string,string[]>={pending:['approved','rejected'],approved:['paid','rejected']};
     if(!allowed[record.status]?.includes(b.status))fail(409,'Invalid payment status transition.');
     if(b.status==='paid')await client.query('UPDATE withdrawals SET payment_reference=$1 WHERE id=$2',[text(b.paymentReference,200),id]);
    }
    result=await client.query(`UPDATE ${table} SET status=$1,reviewed_at=now(),reviewer_id=$2 WHERE id=$3 RETURNING *`,[b.status,actor.id,id]);
   }else fail(404,'Endpoint not found.');
   if(!result.rows.length)fail(404,'Record not found.');
   if(path.startsWith('admin'))await client.query('INSERT INTO audit_logs(actor_id,action,record_id) VALUES($1,$2,$3)',[actor.id,`${path}:${b.status||'create'}`,result.rows[0].id]);
   await client.query('COMMIT');return reply({ok:true});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }catch(e:any){if(e instanceof HttpError)return reply({error:e.message},e.status);if(e?.code==='23505')return reply({error:'This submission or payment reference already exists.'},409);if(e?.code==='40P01')return reply({error:'Concurrent update. Please retry.'},409);return reply({error:'The service is temporarily unavailable. Please retry.'},503);}
};
function reply(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export const config:Config={path:'/api/*'};
