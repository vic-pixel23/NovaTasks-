import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { hasVerifiedEmail } from '../netlify/functions/verified-user.js';

test('verification checks the full Identity record when JWT claims omit confirmation', async()=>{
 const user={id:'existing-user',email:'member@example.test'};
 const req=new Request('https://example.test/api/me',{headers:{cookie:'nf_jwt=test-session'}});
 let calls=0;
 const lookup=async(input:any,options:any)=>{
  calls++;assert.equal(String(input),'https://example.test/.netlify/identity/user');
  assert.equal(options.headers.Authorization,'Bearer test-session');
  return Response.json({id:user.id,email:user.email,confirmed_at:'2026-11-03'});
 };
 assert.equal(await hasVerifiedEmail(user,req,lookup),true);assert.equal(calls,1);
 for(const record of [{...user},{...user,id:'another-user',confirmed_at:'today'},{...user,email:'other@example.test',confirmed_at:'today'}]){
  assert.equal(await hasVerifiedEmail(user,req,async()=>Response.json(record)),false);
 }
 assert.equal(await hasVerifiedEmail(user,req,async()=>new Response(null,{status:401})),false);
 assert.equal(await hasVerifiedEmail(user,req,async()=>{throw Error('offline');}),false);
 assert.equal(await hasVerifiedEmail(null,req,lookup),false);
 assert.equal(await hasVerifiedEmail(user,new Request(req.url),lookup),false);
});

async function callbackHarness(hash:string,type:string,user:any={id:'existing',roles:['admin','creator']},failure=false){
 const source=await readFile('public/assets/app.js','utf8');
 const state:any={page:null,message:null,refreshes:0,callbacks:0,cleaned:false};
 const elements:any={};
 const context:any={URLSearchParams,Error,location:{hash,pathname:'/',search:''},history:{replaceState:()=>{state.cleaned=true;}},
  window:{addEventListener:()=>{}},getUser:async()=>user,
  handleAuthCallback:async()=>{state.callbacks++;if(failure)throw Error('expired');return {type,user,token:'invite-test'};},
  refresh:async()=>{state.refreshes++;},render:()=>{},showPage:(page:string)=>{state.page=page;},notice:(message:string)=>{state.message=message;},
  $:(id:string)=>elements[id]??=( {} ),form:()=>'<form></form>',field:()=>'',authBusy:false,passwordRequired:false,inviteToken:null};
 vm.createContext(context);
 // Exercise the actual startup/callback code without calling Identity or mutating accounts.
 vm.runInContext(source.slice(source.indexOf('function showPasswordForm')).replace(/startAuth\(\);\s*$/,''),context);
 await context.startAuth();return {state,context};
}
test('confirmation and email change finish before loading the existing account and retain messages',async()=>{
 for(const type of ['confirmation','email_change']){
  const {state,context}=await callbackHarness('#'+type+'_token=test',type);
  assert.equal(state.callbacks,1);assert.equal(state.refreshes,1);assert.equal(state.page,'dashboard');
  assert.match(state.message,/confirmed successfully/);assert.equal(context.authBusy,false);
 }
});
test('email change waits for login without consuming its token',async()=>{
 const {state}=await callbackHarness('#email_change_token=test','email_change',null);
 assert.equal(state.callbacks,0);assert.equal(state.page,'login');assert.equal(state.cleaned,false);assert.match(state.message,/existing account/);
});
test('recovery and invite require a password before dashboard requests',async()=>{
 for(const type of ['recovery','invite']){
  const {state,context}=await callbackHarness('#'+type+'_token=test',type);
  assert.equal(state.page,'password-reset');assert.equal(state.refreshes,0);assert.equal(context.passwordRequired,true);
  assert.equal(context.inviteToken,type==='invite'?'invite-test':null);
 }
});
test('invalid callbacks clear sensitive hashes and show actionable errors',async()=>{
 const {state}=await callbackHarness('#confirmation_token=expired','confirmation',undefined,true);
 assert.equal(state.cleaned,true);assert.equal(state.page,'login');assert.match(state.message,/expired or already used/);
 const result=await callbackHarness('#error=access_denied','oauth');assert.equal(result.state.callbacks,0);assert.equal(result.state.cleaned,true);
});
