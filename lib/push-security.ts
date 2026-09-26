export function safePushEndpoint(value:string){
  try{
    const url=new URL(value)
    if(url.protocol!=="https:"||url.username||url.password)return false
    const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase()
    if(!host||host.includes(":"))return false
    if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||/^\d+$/.test(host))return false
    if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".home.arpa"))return false
    if(!/^[a-z0-9.-]+$/.test(host)||!host.includes(".")||host.startsWith(".")||host.endsWith(".")||host.includes(".."))return false
    return true
  }catch{return false}
}
