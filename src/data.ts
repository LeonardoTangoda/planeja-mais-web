import { supabase } from './lib';

export type Overview={
  year:number;month:number;default_currency:string;
  summary:Record<string,{receita:number;gasto:number;saldo:number}>;
  series:Record<string,Array<{day:number;receita:number;gasto:number;saldo:number}>>;
  categories:Record<string,Array<{name:string;amount:number}>>;
  upcoming_recurring:Array<{id:number;description:string;amount:number|null;currency:string;category:string;day_of_month:number|null}>;
  commitments:Array<{id:number;title:string;starts_at:string}>;
};
export type Tx={id:number;kind:string;amount:number;currency:string;category:string;description:string;occurred_at:string;source:string};
export type AccountInfo={id:number;email:string|null;first_name:string|null;default_currency:string;timezone:string;subscription_status:string;subscription_plan:string;billing_enabled:boolean;trial_ends_at:string|null;current_period_ends_at:string|null;access_until:string|null};
type UserRow=AccountInfo;

async function currentUserRow():Promise<UserRow>{
  const {data,error}=await supabase.from('users').select('id,email,first_name,default_currency,timezone,subscription_status,subscription_plan,billing_enabled,trial_ends_at,current_period_ends_at,access_until').single();
  if(error) throw error;
  return data as UserRow;
}


export async function loadAccount():Promise<AccountInfo>{
  return currentUserRow();
}

export function accountHasAccess(account:AccountInfo|null){
  if(!account) return false;
  if(!account.billing_enabled) return true;
  if(account.subscription_status==='active'||account.subscription_status==='trial') return true;
  return !!account.access_until && new Date(account.access_until).getTime()>Date.now();
}

function monthWindow(now:Date){
  const year=now.getFullYear(), month=now.getMonth();
  return {year,month:month+1,start:new Date(year,month,1),end:new Date(year,month+1,1),days:new Date(year,month+1,0).getDate()};
}
export async function loadOverview():Promise<Overview>{
  const user=await currentUserRow();
  const now=new Date(), w=monthWindow(now);
  const [txRes,recRes,comRes]=await Promise.all([
    supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').eq('user_id',user.id).gte('occurred_at',w.start.toISOString()).lt('occurred_at',w.end.toISOString()).order('occurred_at'),
    supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month').eq('user_id',user.id).eq('active',true).order('day_of_month'),
    supabase.from('commitments').select('id,title,starts_at').eq('user_id',user.id).gte('starts_at',now.toISOString()).order('starts_at').limit(10),
  ]);
  if(txRes.error) throw txRes.error;
  if(recRes.error) throw recRes.error;
  if(comRes.error) throw comRes.error;
  const txs=(txRes.data||[]) as Tx[];
  const summary:Overview['summary']={};
  const categories:Overview['categories']={};
  const daily:Record<string,Record<number,{receita:number;gasto:number}>>={};
  for(const tx of txs){
    const cur=tx.currency;
    summary[cur]??={receita:0,gasto:0,saldo:0};
    summary[cur][tx.kind==='receita'?'receita':'gasto']+=Number(tx.amount);
    const day=new Date(tx.occurred_at).getDate();
    daily[cur]??={}; daily[cur][day]??={receita:0,gasto:0};
    daily[cur][day][tx.kind==='receita'?'receita':'gasto']+=Number(tx.amount);
    if(tx.kind==='gasto'){
      categories[cur]??=[];
      const found=categories[cur].find(x=>x.name===tx.category);
      found?found.amount+=Number(tx.amount):categories[cur].push({name:tx.category,amount:Number(tx.amount)});
    }
  }
  const series:Overview['series']={};
  const currencies=new Set([...Object.keys(summary),user.default_currency]);
  for(const cur of currencies){
    summary[cur]??={receita:0,gasto:0,saldo:0};
    summary[cur].saldo=summary[cur].receita-summary[cur].gasto;
    categories[cur]=(categories[cur]||[]).sort((a,b)=>b.amount-a.amount);
    let receita=0,gasto=0;
    series[cur]=Array.from({length:w.days},(_,i)=>{
      const day=i+1, values=daily[cur]?.[day]||{receita:0,gasto:0};
      receita+=values.receita; gasto+=values.gasto;
      return {day,receita,gasto,saldo:receita-gasto};
    });
  }
  return {
    year:w.year,month:w.month,default_currency:user.default_currency,
    summary,series,categories,
    upcoming_recurring:(recRes.data||[]).map(r=>({...r,amount:r.amount===null?null:Number(r.amount)})),
    commitments:(comRes.data||[]) as Overview['commitments'],
  };
}

export async function listTransactions(limit=30):Promise<Tx[]>{
  const user=await currentUserRow();
  const {data,error}=await supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').eq('user_id',user.id).order('occurred_at',{ascending:false}).limit(limit);
  if(error) throw error;
  return (data||[]).map(x=>({...x,amount:Number(x.amount)})) as Tx[];
}
function normalizeCategory(name:string){
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
}

export async function addCategory(name:string){
  const user=await currentUserRow();
  const clean=name.trim().slice(0,64);
  const {error}=await supabase.from('categories').upsert({user_id:user.id,name:clean,normalized_name:normalizeCategory(clean),is_default:false},{onConflict:'user_id,normalized_name'});
  if(error) throw error;
}

export async function updateTransaction(id:number,changes:{amount:number;category:string;description:string}){
  const user=await currentUserRow();
  const category=changes.category.trim().slice(0,64);
  await addCategory(category);
  const {error}=await supabase.from('transactions').update({amount:changes.amount,category,description:changes.description.trim().slice(0,500)}).eq('id',id).eq('user_id',user.id);
  if(error) throw error;
}
