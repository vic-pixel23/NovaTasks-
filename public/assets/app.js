import { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite } from './identity.js';
const $=id=>document.getElementById(id);let me=null,data=null,admin=null,inviteToken=null;let authBusy=true,passwordRequired=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(n/100);
function notice(message){$('message').textContent=message;}
async function api(path,body){await getUser();const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed.');return d;}
async function run(action){try{notice('Loading…');notice('');await action();}catch(e){notice(e.message);}}
function showPage(id){if(passwordRequired)id='password-reset';if(!document.getElementById(id)?.classList.contains('page'))id=me?'dashboard':'home';if(['dashboard','task-details','admin','creator-dashboard'].includes(id)&&!me)id='login';if(['admin','creator-dashboard'].includes(id)&&me?.role!=='admin')id='dashboard';document.querySelectorAll('.page').forEach(s=>s.classList.toggle('active',s.id===id));window.scrollTo({top:0,behavior:'smooth'});}
Object.assign(window,{showPage});
function field(name,label,type='text',extra=''){return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" required ${extra}></div>`;}
function form(id,content,label){return `<form id="${id}">${content}<button class="primary">${label}</button></form>`;}
function table(headers,rows){return `<div class="card table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}">No records yet.</td></tr>`}</tbody></table></div>`;}
function stat(label,value){return `<div class="card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;}
function buttons(kind,id,status){const next=kind==='submission'?(status==='pending'?['approved','rejected']:[]):({pending:['approved','rejected'],approved:['paid','rejected']}[status]||[]);return next.map(s=>`<button class="secondary" data-review="${kind}" data-id="${id}" data-status="${s}">${s==='paid'?'Record payment':s}</button>`).join(' ');}
function render(){
 $('session-actions').innerHTML=me?`<button class="outline" onclick="showPage('dashboard')">My Dashboard</button>${me.role==='admin'?'<button class="secondary" onclick="showPage(\'creator-dashboard\')">Administration</button>':''}<button class="primary" id="logout">Sign out</button>`:'<button class="primary" onclick="showPage(\'login\')">Sign in</button>';
 if(!data)return;
 $('dashboard').innerHTML=`<h1>My Dashboard</h1><p class="small">${esc(me.fullName)}</p><div class="grid">${stat('Available balance',money(data.balanceKobo))}${stat('Pending rewards',money(data.submissions.filter(s=>s.status==='pending').reduce((n,s)=>n+s.rewardKobo,0)))}${stat('Completed tasks',data.submissions.filter(s=>s.status==='approved').length)}${stat('Pending submissions',data.submissions.filter(s=>s.status==='pending').length)}</div><h2 class="section-title">Available tasks</h2><div class="grid">${data.tasks.map(t=>`<article class="card task-card"><span class="tag">${esc(t.kind)}</span><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p><div class="reward">${money(t.rewardKobo)}</div><p>${t.slots} places remaining</p><button class="primary" data-task="${t.id}" ${t.slots<1?'disabled':''}>View task</button></article>`).join('')||'<div class="card empty">No published tasks yet.</div>'}</div><h2 class="section-title">My submissions</h2>${table(['Task ID','Proof','Status','Reward'],data.submissions.map(s=>`<tr><td>${esc(s.taskId)}</td><td>${esc(s.proof)}</td><td>${esc(s.status)}</td><td>${money(s.rewardKobo)}</td></tr>`))}<h2 class="section-title">Reward transactions</h2>${table(['Date','Type','Amount','Status'],data.rewards.map(r=>`<tr><td>${esc(r.transactionAt)}</td><td>${esc(r.type)}</td><td>${money(r.amountKobo)}</td><td>${esc(r.status)}</td></tr>`))}<h2 class="section-title">Request withdrawal</h2><div class="card"><p class="small">Requests reserve your available balance. Administrators process bank transfers separately and record the payment reference.</p>${form('withdraw',field('amount','Amount (NGN)','number','min="0.01" step="0.01"')+field('paymentDetails','Bank name, account number, and account holder','text','maxlength="1000"'),'Request withdrawal')}</div><h2 class="section-title">My withdrawals</h2>${table(['Requested','Amount','Status','Reference'],data.withdrawals.map(w=>`<tr><td>${esc(w.requestedAt)}</td><td>${money(w.amountKobo)}</td><td>${esc(w.status)}</td><td>${esc(w.paymentReference)}</td></tr>`))}`;
 if(admin)renderAdmin();
}
function renderAdmin(){const a=admin,s=a.statistics;const content=`<h1>Administration</h1><div class="grid">${stat('Registered users',s.users)}${stat('Active users',s.activeUsers)}${stat('Tasks and surveys',s.tasks)}${stat('Pending submissions',s.pendingSubmissions)}${stat('Rewards earned',money(s.earnedKobo))}${stat('Payments recorded',money(s.paidKobo))}${stat('Pending withdrawals',money(s.reservedKobo))}</div><h2 class="section-title">Create a task or survey</h2><div class="card">${form('task-form',field('title','Title','text','maxlength="100"')+field('description','Instructions and proof requirements','text','maxlength="5000"')+'<div class="field"><label for="kind">Type</label><select id="kind" name="kind"><option value="task">Task</option><option value="survey">Survey</option></select></div>'+field('reward','Reward (NGN)','number','min="0.01" step="0.01"')+field('slots','Participant slots','number','min="1" max="100000" step="1"'),'Publish task')}</div><h2 class="section-title">Task management</h2>${table(['Title','Reward','Available slots','Status','Action'],a.tasks.map(t=>`<tr><td>${esc(t.title)}</td><td>${money(t.rewardKobo)}</td><td>${t.slots}</td><td>${esc(t.status)}</td><td>${['published','paused','closed'].filter(s=>s!==t.status).map(s=>`<button class="secondary" data-task-status="${s}" data-id="${t.id}">${s}</button>`).join(' ')}</td></tr>`))}<h2 class="section-title">Submission review</h2>${table(['User','Task','Submitted proof','Status','Decision'],a.submissions.map(s=>`<tr><td>${esc(s.userId)}</td><td>${esc(s.taskId)}</td><td style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s.proof)}</td><td>${esc(s.status)}</td><td>${buttons('submission',s.id,s.status)}</td></tr>`))}<h2 class="section-title">Withdrawal management</h2>${table(['User','Amount','Bank details','Status','Reference','Decision'],a.withdrawals.map(w=>`<tr><td>${esc(w.userId)}</td><td>${money(w.amountKobo)}</td><td>${esc(w.paymentDetails)}</td><td>${esc(w.status)}</td><td>${esc(w.paymentReference)}</td><td>${buttons('withdrawal',w.id,w.status)}</td></tr>`))}<h2 class="section-title">Users</h2>${table(['Name','Email','Registered','Role','Status','Action'],a.users.map(u=>`<tr><td>${esc(u.fullName)}</td><td>${esc(u.email)}</td><td>${esc(u.registeredAt)}</td><td>${esc(u.role)}</td><td>${esc(u.status)}</td><td>${u.id!==me.id?`<button class="secondary" data-user="${u.id}" data-status="${u.status==='active'?'suspended':'active'}">${u.status==='active'?'Suspend':'Restore'}</button>`:''}</td></tr>`))}<h2 class="section-title">Audit history</h2>${table(['Date','Administrator','Action','Record'],a.audit.map(r=>`<tr><td>${esc(r.createdAt)}</td><td>${esc(r.actorId)}</td><td>${esc(r.action)}</td><td>${esc(r.recordId)}</td></tr>`))}<p class="small">Administrator roles are assigned through Netlify Identity by the platform owner.</p>`;
 $('creator-dashboard').innerHTML=content;$('admin').innerHTML='<h1>Administrator Dashboard</h1><button class="primary" onclick="showPage(\'creator-dashboard\')">Open administration workspace</button>';
}
async function refresh(){data=await api('me');me=data.user;admin=me.role==='admin'?await api('admin'):null;render();}
for(const id of ['login','creator-login','admin-login']){const container=$(id);const f=container.querySelector('form');f.removeAttribute('onsubmit');f.id=id+'-form';f.querySelector('[type=email]').name='email';f.querySelector('[type=password]').name='password';f.querySelector('[type=password]').autocomplete='current-password';container.querySelector('.notice').textContent='Sign in securely with your NovaTasks account.';}
const rf=$('register').querySelector('form');rf.removeAttribute('onsubmit');rf.id='register-form';rf.querySelectorAll('input').forEach((i,n)=>i.name=['name','email','password'][n]);$('register').querySelector('.notice').textContent='Verify your email to activate your account.';
$('login').querySelector('.card').insertAdjacentHTML('beforeend','<button class="outline" id="forgot">Forgot password</button>');
let withdrawalKey=crypto.randomUUID();
document.addEventListener('submit',e=>{e.preventDefault();if(authBusy)return;const f=e.target,b=Object.fromEntries(new FormData(f));run(async()=>{
 if(f.id.endsWith('login-form')){await login(b.email,b.password);f.reset();if(new URLSearchParams(location.hash.slice(1)).has('email_change_token')){await processAuthCallback();return;}await refresh();showPage(f.id==='login-form'?'dashboard':'creator-dashboard');notice('Signed in successfully.');}
 if(f.id==='register-form'){await signup(b.email,b.password,{full_name:b.name});f.reset();notice('Check your email to confirm your account.');}
 if(f.id==='password-form'){if(inviteToken)await acceptInvite(inviteToken,b.password);else await updateUser({password:b.password});inviteToken=null;passwordRequired=false;f.reset();await refresh();showPage('dashboard');notice('Password saved successfully.');}
 if(f.id==='task-form'){await api('admin/task',{...b,slots:Number(b.slots)});await refresh();}
 if(f.id==='proof-form'){await api('submit',{taskId:f.dataset.task,proof:b.proof});await refresh();showPage('dashboard');}
 if(f.id==='withdraw'){await api('withdraw',{...b,requestKey:withdrawalKey});withdrawalKey=crypto.randomUUID();await refresh();}
 });});
document.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||authBusy)return;run(async()=>{
 if(el.id==='logout'){await logout();me=data=admin=null;document.querySelectorAll('#dashboard,#admin,#creator-dashboard,#task-detail-content').forEach(x=>x.innerHTML='');render();showPage('home');}
 if(el.id==='forgot'){const email=prompt('Email address for password recovery');if(email){await requestPasswordRecovery(email);notice('Check your email for a password recovery link.');}}
 if(el.dataset.task){const t=data.tasks.find(t=>t.id===el.dataset.task);$('task-detail-content').innerHTML=`<span class="tag">${esc(t.kind)}</span><h2>${esc(t.title)}</h2><p style="white-space:pre-wrap;margin:20px 0">${esc(t.description)}</p><div class="reward">${money(t.rewardKobo)}</div>${form('proof-form','<div class="field"><label for="proof">Proof (text or a link)</label><textarea id="proof" name="proof" required maxlength="5000"></textarea></div>','Submit for review')}`;$('proof-form').dataset.task=t.id;showPage('task-details');}
 if(el.dataset.taskStatus){await api('admin/task',{id:el.dataset.id,status:el.dataset.taskStatus});await refresh();}
 if(el.dataset.user){await api('admin/user',{id:el.dataset.user,status:el.dataset.status});await refresh();}
 if(el.dataset.review){let paymentReference;if(el.dataset.status==='paid'){paymentReference=prompt('Enter the reference from the completed bank transfer. Recording a payment does not transfer funds.');if(!paymentReference)return;}await api('admin/'+el.dataset.review,{id:el.dataset.id,status:el.dataset.status,paymentReference});await refresh();}
 });});
function showPasswordForm(callback){
 inviteToken=callback.type==='invite'?callback.token:null;passwordRequired=true;
 $('password-reset').innerHTML='<div class="card"><h2>Set your password</h2>'+form('password-form',field('new-password','New password','password','minlength="8" autocomplete="new-password"').replace('name="new-password"','name="password"'),'Save password')+'</div>';
 showPage('password-reset');notice('Enter a new password to finish signing in.');
}
async function processAuthCallback(){
 const params=new URLSearchParams(location.hash.slice(1));
 const isCallback=['confirmation_token','email_change_token','recovery_token','invite_token','access_token','error','error_description'].some(key=>params.has(key));
 try{
  if(params.has('error')||params.has('error_description'))throw Error('This authentication link is invalid or expired. Request a new link and try again.');
  // Hydrate cookie sessions before the library processes email-change tokens.
  if(params.has('email_change_token')&&!await getUser()){
   render();showPage('login');notice('Sign in to your existing account, then your email change will be confirmed.');return;
  }
  const callback=await handleAuthCallback();
  if(callback?.type==='invite'||callback?.type==='recovery'){showPasswordForm(callback);return;}
  if(await getUser()){await refresh();showPage(isCallback?'dashboard':location.hash.slice(1)||'dashboard');}
  else{render();showPage(location.hash.slice(1)||'home');}
  if(callback?.type==='confirmation')notice('Email confirmed successfully. You are signed in.');
  if(callback?.type==='email_change')notice('Email change confirmed successfully.');
  if(callback?.type==='oauth')notice('Signed in successfully.');
 }catch(error){
  if(isCallback)history.replaceState(null,'',location.pathname+location.search);
  render();showPage('login');
  notice(isCallback?'Unable to complete authentication. The link may be expired or already used. Try signing in, or request a new link.':error.message);
 }
}
async function startAuth(){authBusy=true;try{await processAuthCallback();}finally{authBusy=false;}}
window.addEventListener('hashchange',()=>{if(authBusy)return;const params=new URLSearchParams(location.hash.slice(1));if(['confirmation_token','email_change_token','recovery_token','invite_token','access_token','error','error_description'].some(key=>params.has(key)))startAuth();else showPage(location.hash.slice(1)||'home');});
startAuth();
