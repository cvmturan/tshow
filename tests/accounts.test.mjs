import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('accounts: sessions, isolated storage, conflicts, recovery and deletion', async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'tshow',modules:await Promise.all(['worker.mjs','accounts.mjs','../public/js/media-history.mjs'].map(async f=>({type:'ESModule',path:fileURLToPath(new URL('../cloudflare/'+f,import.meta.url)),contents:await readFile(new URL('../cloudflare/'+f,import.meta.url),'utf8')}))),d1Databases:['DB'],bindings:{APP_ORIGIN:'https://showt.fun'},compatibilityDate:'2026-09-04'}]}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 const sql=(await Promise.all(['0001_accounts.sql','0002_profiles.sql'].map(f=>readFile(new URL('../cloudflare/migrations/'+f,import.meta.url),'utf8')))).join('\n');
 for(const statement of sql.split(';').filter(s=>s.trim())) await db.prepare(statement).run();
 async function call(path,method='GET',data,cookie='',origin='https://showt.fun'){
  return mf.dispatchFetch('https://showt.fun'+path,{method,headers:{Origin:origin,'X-TShow-Request':'1','Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});
 }
 const register=async(email)=>{const r=await call('/api/auth/register','POST',{name:'Test Viewer',email,password:'GoodPass1!'});assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};};
 assert.equal((await call('/api/account/data')).status,401);
 assert.equal((await call('/api/auth/register','POST',{name:'Test',email:'x@example.com',password:'long enough password'},'','https://evil.example')).status,403);
 assert.equal((await call('/api/auth/register','POST',{name:'Test',email:'weak@example.com',password:'lowercase1!'})).status,400);
 const a=await register('alice@example.com'),b=await register('bob@example.com');
 assert.notEqual(a.user.id,b.user.id);assert.equal(a.recoveryCode.length,43);
 assert.equal((await call('/api/account/profile','PUT',{username:'alice_viewer'},a.cookie)).status,200);
 assert.equal((await call('/api/account/profile','PUT',{username:'ALICE_VIEWER'},b.cookie)).status,409);
 assert.equal((await call('/api/auth/login','POST',{email:'alice_viewer',password:'GoodPass1!'})).status,200);
 assert.equal((await call('/api/account/email/send','POST',{},a.cookie)).status,503);
 const verification='v'.repeat(43);
 const tokenHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verification))).toString('base64url');
 await db.prepare('INSERT INTO email_tokens(token_hash,user_id,purpose,expires_at) VALUES (?,?,?,?)').bind(tokenHash,a.user.id,'verify',Math.floor(Date.now()/1000)+60).run();
 assert.equal((await call('/api/account/email/verify','POST',{token:verification},b.cookie)).status,400);
 assert.equal((await call('/api/account/email/verify','POST',{token:verification},a.cookie)).status,200);
 assert.equal((await (await call('/api/auth/me','GET',undefined,a.cookie)).json()).user.emailVerified,true);
 assert.equal((await call('/api/account/email/verify','POST',{token:verification},a.cookie)).status,400);
 const put=(cookie,version,value)=>call('/api/account/data/watchlist','PUT',{version,value},cookie);
 let r=await put(a.cookie,0,[{id:'tt1234567',title:'Test'}]);assert.equal(r.status,200);assert.equal((await r.json()).version,1);
 assert.deepEqual((await (await call('/api/account/data','GET',undefined,b.cookie)).json()).data,{});
 assert.equal((await put(a.cookie,0,[])).status,409);
 assert.equal((await put(a.cookie,1,[])).status,200);
 assert.equal((await call('/api/account/data/addonURLs','PUT',{version:0,value:['javascript:alert(1)']},a.cookie)).status,400);
 assert.equal((await call('/api/auth/login','POST',{email:'alice@example.com',password:'wrong password here'})).status,401);
 r=await call('/api/auth/recover','POST',{email:'alice@example.com',password:'Different7!',recoveryCode:a.recoveryCode});assert.equal(r.status,200,await r.clone().text());
 const recovered=await r.json(),newCookie=r.headers.get('set-cookie').split(';')[0];assert.notEqual(recovered.recoveryCode,a.recoveryCode);
 assert.equal((await call('/api/account/data','GET',undefined,a.cookie)).status,401);
 assert.equal((await call('/api/auth/recover','POST',{email:'alice@example.com',password:'Another8!',recoveryCode:a.recoveryCode})).status,401);
 assert.equal((await call('/api/account','DELETE',{confirm:'DELETE',password:'Different7!'},newCookie)).status,200);
 assert.equal((await call('/api/account/data','GET',undefined,newCookie)).status,401);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM user_data WHERE user_id=?').bind(a.user.id).first()).n,0);
 assert.equal((await call('/api/auth/google/start')).status,503);
 assert.equal((await call('/api/auth/logout','POST',{},b.cookie)).status,200);
 assert.equal((await call('/api/account/data','GET',undefined,b.cookie)).status,401);
});



