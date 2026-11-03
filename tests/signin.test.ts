import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('unconfirmed sign-in sends verification, while invalid credentials do not', async () => {
 const source = await readFile('public/assets/app.js', 'utf8');
 const flow = source.slice(source.indexOf('const verificationMessage='), source.indexOf("document.addEventListener('click'"));
 for (const scenario of ['unconfirmed', 'invalid', 'confirmed', 'delivery-failure']) {
  let submitHandler: (event: unknown) => void = () => {};
  let pending: Promise<unknown> = Promise.resolve();
  let sends = 0, refreshes = 0, message = '', destination = '';
  const button = { disabled: false };
  const panel = { textContent: '' };
  const form = {
   id: 'login-form', dataset: {} as Record<string,string>,
   elements: { email: { value: 'member@example.test' }, password: { value: 'password123' } },
   reportValidity: () => true, querySelector: () => button,
   closest: () => ({ querySelector: () => panel }), reset() {},
  };
  runInNewContext(flow, {
   crypto: { randomUUID: () => 'request-id' },
   document: { addEventListener: (_: string, handler: typeof submitHandler) => { submitHandler = handler; } },
   FormData: class extends Map { constructor() { super([['email','member@example.test'],['password','password123']]); } },
   login: async () => {
    if (scenario === 'invalid') throw Error('Invalid login credentials');
    if (scenario !== 'confirmed') throw Error('Email not confirmed');
   },
   signup: async () => { sends++; if (scenario === 'delivery-failure') throw Error('Email rate limit exceeded'); },
   refresh: async () => { refreshes++; }, showPage: (page: string) => { destination = page; },
   run: (action: () => Promise<string | undefined>) => {
    pending = action().then(result => { message = result || ''; }).catch(error => { message = error.message; });
    return pending;
   },
  });
  submitHandler({ preventDefault() {}, target: form });
  await pending;
  await Promise.resolve();
  assert.equal(button.disabled, false);
  assert.equal(form.dataset.busy, undefined);
  assert.equal(sends, scenario === 'unconfirmed' || scenario === 'delivery-failure' ? 1 : 0);
  assert.equal(refreshes, scenario === 'confirmed' ? 1 : 0);
  if (scenario === 'unconfirmed') assert.match(message, /Verification email sent/);
  if (scenario === 'invalid') assert.equal(message, 'Invalid login credentials');
  if (scenario === 'delivery-failure') assert.match(message, /Could not send.*rate limit/);
  if (scenario === 'confirmed') assert.equal(destination, 'dashboard');
 }
});
