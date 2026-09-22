'use client'
export async function captureLocation():Promise<{latitude:number;longitude:number;accuracy:number}|{gps_status:string}>{
 if(!navigator.onLine)return {gps_status:'offline'}
 if(!navigator.geolocation)return {gps_status:'unavailable'}
 return new Promise(resolve=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),e=>resolve({gps_status:e.code===1?'denied':'unavailable'}),{maximumAge:0,timeout:8000,enableHighAccuracy:true}))
}
