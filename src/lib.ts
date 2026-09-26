import { createClient } from '@supabase/supabase-js';

const url=String(import.meta.env.VITE_SUPABASE_URL||'').trim();
const key=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'').trim();
if(!url||!key)throw new Error('Planeja+ indisponível: configuração do Supabase ausente.');

export const supabase=createClient(url,key);

export const apiBase=String(import.meta.env.VITE_API_URL||'').trim().replace(/\/$/,'');
export async function api<T>(path:string, token:string, init?:RequestInit):Promise<T>{
  if(!apiBase)throw new Error('Planeja+ indisponível: configuração da API ausente.');
  const r=await fetch(apiBase+path,{...init,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...(init?.headers||{})}});
  if(!r.ok){const e=await r.json().catch(()=>({detail:'Erro inesperado'}));throw new Error(e.detail||'Erro inesperado');}
  return r.json();
}
