import { createClient } from '@supabase/supabase-js';

const url=String(import.meta.env.VITE_SUPABASE_URL||'').trim();
const key=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'').trim();
if(!url||!key)throw new Error('Planeja+ indisponível: configuração do Supabase ausente.');

export const supabase=createClient(url,key);
