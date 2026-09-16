import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
 return { id:"/", name:"FS Soluções Tributárias", short_name:"FS Diagnóstico", description:"Diagnósticos e documentos da equipe FS", lang:"pt-BR", start_url:"/diagnostico", scope:"/", display:"standalone", background_color:"#f5f7f9", theme_color:"#10283d", icons:[{src:"/icons/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/icons/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},{src:"/icons/maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"}], shortcuts:[{name:"Diagnóstico",url:"/diagnostico"},{name:"Documentos elaborados",url:"/documentos"}] };
}
