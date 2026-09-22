export type TimeSession={id:string;user_id:string;event_id:string;started_at:string;ended_at:string|null;workplace_id:string|null}
export type TimeBreak={work_session_id:string;started_at:string;ended_at:string|null}
export type Transition={work_session_id:string;to_workplace_id:string;confirmed_at:string}
export type TimeSegment={sessionId:string;userId:string;eventId:string;workplaceId:string|null;start:number;end:number;grossSeconds:number;regularBreakSeconds:number;excessBreakSeconds:number;netSeconds:number}
export function allocateTime(sessions:TimeSession[],breaks:TimeBreak[],transitions:Transition[],now:number):TimeSegment[]{
 const rows:TimeSegment[]=[];const allowance=new Map<string,number>(),previousEnd=new Map<string,number>()
 for(const s of [...sessions].sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at)||a.id.localeCompare(b.id))){
 const start=Date.parse(s.started_at),end=s.ended_at?Date.parse(s.ended_at):now,key=`${s.user_id}:${s.event_id}`
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new Error('Invalid work interval')
 if((previousEnd.get(s.user_id)||0)>start)throw new Error('Overlapping work sessions require correction')
 previousEnd.set(s.user_id,end)
 let available=allowance.get(key)??3600,workplace=s.workplace_id
 const ranges=breaks.filter(b=>b.work_session_id===s.id).map(b=>[Math.max(start,Date.parse(b.started_at)),Math.min(end,b.ended_at?Date.parse(b.ended_at):now)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0])
 const merged:number[][]=[];for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range])}
 const changes=transitions.filter(t=>t.work_session_id===s.id).map(t=>({at:Date.parse(t.confirmed_at),workplace:t.to_workplace_id})).filter(t=>t.at>=start&&t.at<end).sort((a,b)=>a.at-b.at)
 let cursor=start
 for(const point of [...changes,{at:end,workplace:null}]){
 if(point.at>cursor){const duration=(point.at-cursor)/1000;const pause=merged.reduce((n,[a,b])=>n+Math.max(0,Math.min(b,point.at)-Math.max(a,cursor))/1000,0);const regular=Math.min(available,pause);available-=regular;const excess=pause-regular
 rows.push({sessionId:s.id,userId:s.user_id,eventId:s.event_id,workplaceId:workplace,start:cursor,end:point.at,grossSeconds:duration,regularBreakSeconds:regular,excessBreakSeconds:excess,netSeconds:Math.max(0,duration-excess)})}
 cursor=point.at;workplace=point.workplace
 }
 allowance.set(key,available)
 }
 return rows
}
