import { supabase } from './lib';

export type Overview={
  year:number;month:number;default_currency:string;
  summary:Record<string,{receita:number;gasto:number;saldo:number}>;
  series:Record<string,Array<{day:number;receita:number;gasto:number;saldo:number}>>;
  categories:Record<string,Array<{name:string;amount:number}>>;
  upcoming_recurring:Array<{id:number;description:string;amount:number|null;confirmed_amount:number|null;currency:string;category:string;day_of_month:number|null}>;
  commitments:Array<{id:number;title:string;starts_at:string}>;
};
export type Tx={id:number;kind:string;amount:number;currency:string;category:string;description:string;occurred_at:string;source:string};
export type AccountInfo={id:number;email:string|null;first_name:string|null;default_currency:string;timezone:string;subscription_status:string;subscription_plan:string;billing_enabled:boolean;billing_customer_id:string|null;billing_subscription_id:string|null;trial_ends_at:string|null;current_period_ends_at:string|null;access_until:string|null;beta_access:boolean;beta_access_granted_at:string|null};
export type PlanInfo={code:string;name:string;description:string;amount_minor:number|null;currency:string;interval:string;active:boolean;visible:boolean;sort_order:number;features:string[]};
export type Integration={provider:string;status:string;connected_email:string|null;connected_at?:string|null;last_synced_at?:string|null;last_error?:string|null};
type UserRow=AccountInfo;

async function currentUserRow():Promise<UserRow>{
  const {data,error}=await supabase.from('users').select('id,email,first_name,default_currency,timezone,subscription_status,subscription_plan,billing_enabled,billing_customer_id,billing_subscription_id,trial_ends_at,current_period_ends_at,access_until,beta_access,beta_access_granted_at').single();
  if(error) throw error;
  return data as UserRow;
}

export async function loadAccount(){return currentUserRow();}
export function accountHasAccess(account:AccountInfo|null){
  if(!account)return false;
  if(account.beta_access)return true;
  if(['active','trial','trialing'].includes(account.subscription_status))return true;
  return !!account.access_until&&new Date(account.access_until).getTime()>Date.now();
}

export async function loadPlans():Promise<PlanInfo[]>{
  const{data,error}=await supabase.from('billing_plans').select('code,name,description,amount_minor,currency,interval,active,visible,sort_order,features').eq('visible',true).order('sort_order');
  if(error)throw error;return (data||[]) as PlanInfo[];
}
export async function redeemBetaInvite(token:string){const{data,error}=await supabase.rpc('redeem_beta_invite',{p_token:token.trim()});if(error)throw error;return data;}
export async function startSubscriptionCheckout(plan='standard'){const{data,error}=await supabase.functions.invoke('stripe-checkout',{body:{plan}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Checkout indisponível.');window.location.assign(data.url);}
export async function openBillingPortal(){const{data,error}=await supabase.functions.invoke('stripe-portal',{body:{}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Portal de cobrança indisponível.');window.location.assign(data.url);}
function monthWindow(now:Date){
  const year=now.getFullYear(),month=now.getMonth();
  return {year,month:month+1,start:new Date(year,month,1),end:new Date(year,month+1,1),days:new Date(year,month+1,0).getDate()};
}

export async function loadOverview():Promise<Overview>{
  const user=await currentUserRow();
  const now=new Date(),w=monthWindow(now);
  const [txRes,recRes,comRes]=await Promise.all([
    supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').eq('user_id',user.id).gte('occurred_at',w.start.toISOString()).lt('occurred_at',w.end.toISOString()).order('occurred_at'),
    supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month').eq('user_id',user.id).eq('active',true).order('day_of_month'),
    supabase.from('commitments').select('id,title,starts_at').eq('user_id',user.id).gte('starts_at',now.toISOString()).order('starts_at').limit(10),
  ]);
  if(txRes.error)throw txRes.error;if(recRes.error)throw recRes.error;if(comRes.error)throw comRes.error;
  const recIds=(recRes.data||[]).map((r:any)=>r.id);
  const dueStart=`${w.year}-${String(w.month).padStart(2,'0')}-01`;
  const dueEndMonth=w.month===12?1:w.month+1,dueEndYear=w.month===12?w.year+1:w.year;
  const dueEnd=`${dueEndYear}-${String(dueEndMonth).padStart(2,'0')}-01`;
  const occRes=recIds.length?await supabase.from('recurring_occurrences').select('recurring_expense_id,amount,status').in('recurring_expense_id',recIds).gte('due_date',dueStart).lt('due_date',dueEnd):{data:[],error:null};
  if(occRes.error)throw occRes.error;
  const txs=(txRes.data||[]) as Tx[];
  const summary:Overview['summary']={},categories:Overview['categories']={};
  const daily:Record<string,Record<number,{receita:number;gasto:number}>>={};
  for(const tx of txs){
    const cur=tx.currency;summary[cur]??={receita:0,gasto:0,saldo:0};
    summary[cur][tx.kind==='receita'?'receita':'gasto']+=Number(tx.amount);
    const day=new Date(tx.occurred_at).getDate();daily[cur]??={};daily[cur][day]??={receita:0,gasto:0};
    daily[cur][day][tx.kind==='receita'?'receita':'gasto']+=Number(tx.amount);
    if(tx.kind==='gasto'){categories[cur]??=[];const found=categories[cur].find(x=>x.name===tx.category);found?found.amount+=Number(tx.amount):categories[cur].push({name:tx.category,amount:Number(tx.amount)});}
  }  const series:Overview['series']={};
  const currencies=new Set([...Object.keys(summary),user.default_currency]);
  for(const cur of currencies){
    summary[cur]??={receita:0,gasto:0,saldo:0};summary[cur].saldo=summary[cur].receita-summary[cur].gasto;
    categories[cur]=(categories[cur]||[]).sort((a,b)=>b.amount-a.amount);
    let receita=0,gasto=0;
    series[cur]=Array.from({length:w.days},(_,i)=>{const day=i+1,v=daily[cur]?.[day]||{receita:0,gasto:0};receita+=v.receita;gasto+=v.gasto;return{day,receita,gasto,saldo:receita-gasto};});
  }
  return {year:w.year,month:w.month,default_currency:user.default_currency,summary,series,categories,
    upcoming_recurring:(recRes.data||[]).map((r:any)=>{const o=(occRes.data||[]).find((x:any)=>x.recurring_expense_id===r.id);return {...r,amount:r.amount===null?null:Number(r.amount),confirmed_amount:o?.amount==null?null:Number(o.amount)};}),
    commitments:(comRes.data||[]) as Overview['commitments']};
}

export async function listTransactions(kind?:'receita'|'gasto',limit=500):Promise<Tx[]>{
  const user=await currentUserRow();let q=supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').eq('user_id',user.id).order('occurred_at',{ascending:false}).limit(limit);
  if(kind)q=q.eq('kind',kind);const {data,error}=await q;if(error)throw error;
  return (data||[]).map(x=>({...x,amount:Number(x.amount)})) as Tx[];
}

function normalizeCategory(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');}
export async function listCategories(){const user=await currentUserRow();const{data,error}=await supabase.from('categories').select('id,name,is_default').eq('user_id',user.id).order('name');if(error)throw error;return data||[];}
export async function addCategory(name:string){const user=await currentUserRow();const clean=name.trim().slice(0,64);const{error}=await supabase.from('categories').upsert({user_id:user.id,name:clean,normalized_name:normalizeCategory(clean),is_default:false},{onConflict:'user_id,normalized_name'});if(error)throw error;}export async function updateTransaction(id:number,changes:Partial<Pick<Tx,'kind'|'amount'|'currency'|'category'|'description'|'occurred_at'>>){
  const user=await currentUserRow();const patch:any={...changes};
  if(changes.category){patch.category=changes.category.trim().slice(0,64);await addCategory(patch.category);}
  if(changes.description!==undefined)patch.description=changes.description.trim().slice(0,500);
  const{error}=await supabase.from('transactions').update(patch).eq('id',id).eq('user_id',user.id);if(error)throw error;
}
export async function deleteTransaction(id:number){const user=await currentUserRow();const{error}=await supabase.from('transactions').delete().eq('id',id).eq('user_id',user.id);if(error)throw error;}
export async function listCommitments(){const user=await currentUserRow();const{data,error}=await supabase.from('commitments').select('id,title,starts_at,raw_text').eq('user_id',user.id).gte('starts_at',new Date().toISOString()).order('starts_at').limit(100);if(error)throw error;return data||[];}
export async function listRecurring(){const user=await currentUserRow();const{data,error}=await supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month,active').eq('user_id',user.id).order('day_of_month');if(error)throw error;return (data||[]).map((r:any)=>({...r,amount:r.amount===null?null:Number(r.amount)}));}
export async function setVariableRecurringAmount(id:number,value:number){const{data,error}=await supabase.rpc('set_variable_recurring_amount',{p_recurring_id:id,p_amount:value});if(error)throw error;return data;}
export async function loadIntegration(provider='google_calendar'):Promise<Integration>{const user=await currentUserRow();const{data,error}=await supabase.from('user_integrations').select('provider,status,connected_email,connected_at,last_synced_at,last_error').eq('user_id',user.id).eq('provider',provider).maybeSingle();if(error)throw error;return data||{provider,status:'disconnected',connected_email:null,connected_at:null,last_synced_at:null,last_error:null};}
export async function connectGoogleCalendar(){const{data,error}=await supabase.functions.invoke('google-calendar-oauth',{body:{action:'start'}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Não consegui iniciar a conexão com o Google.');window.location.assign(data.url);}
export async function disconnectGoogleCalendar(){const{error}=await supabase.functions.invoke('google-calendar-oauth',{body:{action:'disconnect'}});if(error)throw error;}
export async function syncGoogleCalendar(){const{data,error}=await supabase.functions.invoke('google-calendar-sync',{body:{sync_all:true}});if(error)throw error;return data;}
export async function updateAccount(changes:Partial<Pick<AccountInfo,'first_name'|'default_currency'|'timezone'>>){const user=await currentUserRow();const{error}=await supabase.from('users').update(changes).eq('id',user.id);if(error)throw error;}
