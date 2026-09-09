import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL || ''; const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const supabase=createClient(url || 'http://localhost:54321', key || 'local-placeholder');
export const apiBase=(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/,'');
export async function api<T>(path:string, token:string, init?:RequestInit):Promise<T>{const r=await fetch(apiBase+path,{...init,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...(init?.headers||{})}});if(!r.ok){const e=await r.json().catch(()=>({detail:'Erro inesperado'}));throw new Error(e.detail||'Erro inesperado');}return r.json();}
