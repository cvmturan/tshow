import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('accounts: sessions, isolated storage, conflicts, recovery and deletion', async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'tshow',modules:await Promise.all(['worker.mjs','accounts.mjs'].map(async f=>({type:'ESModule',path:fileURLToPath(new URL('../cloudflare/'+f,import.meta.url)),contents:await readFile(new URL('../cloudflare/'+f,import.meta.url),'utf8')}))),d1Databases:['DB'],bindings:{APP_ORIGIN:'https://showt.fun'},compatibilityDate:'2026-09-04'}]}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 const sql=await readFile(new URL('../cloudflare/migrations/0001_accounts.sql',import.meta.url),'utf8');
 for(const statement of sql.split(';').filter(s=>s.trim())) await db.prepare(statement).run();
 async function call(path,method='GET',data,cookie='',origin='https://showt.fun'){
  return mf.dispatchFetch('https://showt.fun'+path,{method,headers:{Origin:origin,'X-TShow-Request':'1','Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});
 }
 const register=async(email)=>{const r=await call('/api/auth/register','POST',{name:'Test Viewer',email,password:'correct horse battery staple'});assert.equal(r.status,200,await r.clone().text());assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};};
 assert.equal((await call('/api/account/data')).status,401);
 assert.equal((await call('/api/auth/register','POST',{name:'Test',email:'x@example.com',password:'long enough password'},'','https://evil.example')).status,403);
 const a=await register('alice@example.com'),b=await register('bob@example.com');
 assert.notEqual(a.user.id,b.user.id);assert.equal(a.recoveryCode.length,43);
 const put=(cookie,version,value)=>call('/api/account/data/watchlist','PUT',{version,value},cookie);
 let r=await put(a.cookie,0,[{id:'tt1234567',title:'Test'}]);assert.equal(r.status,200);assert.equal((await r.json()).version,1);
 assert.deepEqual((await (await call('/api/account/data','GET',undefined,b.cookie)).json()).data,{});
 assert.equal((await put(a.cookie,0,[])).status,409);
 assert.equal((await put(a.cookie,1,[])).status,200);
 assert.equal((await call('/api/account/data/addonURLs','PUT',{version:0,value:['javascript:alert(1)']},a.cookie)).status,400);
 assert.equal((await call('/api/auth/login','POST',{email:'alice@example.com',password:'wrong password here'})).status,401);
 r=await call('/api/auth/recover','POST',{email:'alice@example.com',password:'a different secure password',recoveryCode:a.recoveryCode});assert.equal(r.status,200,await r.clone().text());
 const recovered=await r.json(),newCookie=r.headers.get('set-cookie').split(';')[0];assert.notEqual(recovered.recoveryCode,a.recoveryCode);
 assert.equal((await call('/api/account/data','GET',undefined,a.cookie)).status,401);
 assert.equal((await call('/api/auth/recover','POST',{email:'alice@example.com',password:'another secure password',recoveryCode:a.recoveryCode})).status,401);
 assert.equal((await call('/api/account','DELETE',{confirm:'DELETE',password:'a different secure password'},newCookie)).status,200);
 assert.equal((await call('/api/account/data','GET',undefined,newCookie)).status,401);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM user_data WHERE user_id=?').bind(a.user.id).first()).n,0);
 assert.equal((await call('/api/auth/google/start')).status,503);
 assert.equal((await call('/api/auth/logout','POST',{},b.cookie)).status,200);
 assert.equal((await call('/api/account/data','GET',undefined,b.cookie)).status,401);
});



