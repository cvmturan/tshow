export function historyIdentity(m) {
 const type=['tv','series'].includes(m.media_type||m._stremioType)?'tv':'movie';
 const imdb=[m.imdb_id,m._stremioId,m.id].map(v=>String(v||'').match(/^(tt\d+)(?=:|$)/i)?.[1]?.toLowerCase()).find(Boolean);
 if(imdb)return type+':'+imdb;
 const tmdb=m._tmdbId||(!m._sourceAddonId&&/^\d+$/.test(String(m.id))?m.id:null);
 if(tmdb)return type+':tmdb:'+tmdb;
 return type+':'+String(m.id||m._stremioId||'')+':'+String(m._sourceAddonId||'');
}
export function uniqueHistory(items) {
 const seen=new Set();
 return (Array.isArray(items)?items:[]).filter(m=>{if(!m||typeof m!=='object')return false;const key=historyIdentity(m);if(seen.has(key))return false;seen.add(key);return true;});
}
