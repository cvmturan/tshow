export function nextEpisode(details, currentId, now = Date.now()) {
 const videos=(Array.isArray(details?.videos)?details.videos:[]).filter(v=>v.id && Number(v.season)>0 && Number(v.episode)>0).sort((a,b)=>a.season-b.season||a.episode-b.episode);
 const i=videos.findIndex(v=>v.id===currentId);
 if(i>=0){const v=videos[i+1];return v && (!v.released || Date.parse(v.released)<=now) ? v : null;}
 const match=String(currentId||'').match(/^(tt\d+):(\d+):(\d+)$/);if(!match)return null;
 const seasons=(Array.isArray(details?.seasons)?details.seasons:[]).filter(s=>s.season_number>0 && s.episode_count>0).sort((a,b)=>a.season_number-b.season_number);
 const season=seasons.find(s=>s.season_number===Number(match[2]));
 if(!season)return null;
 const following=Number(match[3])<season.episode_count ? {season:Number(match[2]),episode:Number(match[3])+1} : {season:seasons.find(s=>s.season_number>Number(match[2]))?.season_number,episode:1};
 if(!following.season)return null;
 // Counts do not establish an episode release date. Only advance within completed seasons.
 if(!details.last_episode_to_air || following.season>details.last_episode_to_air.season_number || (following.season===details.last_episode_to_air.season_number && following.episode>details.last_episode_to_air.episode_number))return null;
 return {...following,id:`${match[1]}:${following.season}:${following.episode}`};
}
export function upcomingEpisodes(details, now = Date.now()) {
 const start=new Date(now);start.setHours(0,0,0,0);const end=now+90*86400000;
 const candidates=Array.isArray(details?.videos) && details.videos.length ? details.videos.map(v=>({...v,date:v.released})) : details?.next_episode_to_air ? [{...details.next_episode_to_air,date:details.next_episode_to_air.air_date,season:details.next_episode_to_air.season_number,episode:details.next_episode_to_air.episode_number}] : [];
 return candidates.filter(v=>Number.isFinite(Date.parse(v.date))&&Date.parse(v.date)>=+start&&Date.parse(v.date)<=end).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,12);
}
export function matchesSource(stream, filters={}) {
 const text=[stream.name,stream.title,stream.description,stream.language,stream.lang].filter(Boolean).join(' ').toLowerCase();
 return (!filters.quality || text.includes(filters.quality)) && (!filters.language || text.includes(filters.language.toLowerCase())) && (!filters.maxSize || (Number(stream.sizeBytes)>0 && Number(stream.sizeBytes)<=Number(filters.maxSize)*1024**3));
}
export function resumePosition(position,duration){return Number.isFinite(position)&&position>0&&Number.isFinite(duration)&&duration>0?Math.min(position,Math.max(0,duration-2)):0;}
