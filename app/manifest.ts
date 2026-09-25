import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id:'/',
    name:'UP TILL DAWN PERSONEELSBEHEER',
    short_name:'UP TILL DAWN',
    description:'Personeelsbeheer voor Up Till Dawn-evenementen',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:'#050505',
    theme_color:'#050505',
    icons:[{src:'/up-till-dawn-mark.webp',sizes:'216x216',type:'image/webp'}],
  }
}
