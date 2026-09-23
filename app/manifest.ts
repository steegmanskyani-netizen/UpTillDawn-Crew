import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest { return {name:'UPTILLDAWN CREW MANAGEMENT',short_name:'UPTILLDAWN',description:'Crewbeheer voor Uptilldawn-events',start_url:'/',display:'standalone',background_color:'#050505',theme_color:'#050505',icons:[{src:'/uptilldawn-mark.svg',sizes:'512x512',type:'image/svg+xml'}]} }
