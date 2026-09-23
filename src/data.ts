import { supabase } from './lib';

export type Overview={
  year:number;month:number;default_currency:string;
  summary:Record<string,{receita:number;gasto:number;saldo:number}>;
  consolidated?:Record<string,{receita:number;gasto:number;saldo:number}>;
  series:Record<string,Array<{day:number;receita:number;gasto:number;saldo:number}>>;
  categories:Record<string,Array<{name:string;amount:number}>>;
  upcoming_recurring:Array<{id:number;description:string;amount:number|null;confirmed_amount:number|null;currency:string;category:string;day_of_month:number|null}>;
  commitments:Array<{id:number;title:string;starts_at:string}>;
};
export type Tx={id:number;kind:string;amount:number;currency:string;category:string;description:string;occurred_at:string;source:string};
export type AccountInfo={id:number;email:string|null;first_name:string|null;default_currency:string;timezone:string;subscription_status:string;subscription_plan:string;billing_enabled:boolean;billing_customer_id:string|null;billing_subscription_id:string|null;trial_ends_at:string|null;current_period_ends_at:string|null;access_until:string|null;beta_access:boolean;beta_access_granted_at:string|null;phone_e164:string|null;preferred_chat:'telegram'|'whatsapp'|null;chat_consent_at:string|null;whatsapp_opt_in_at:string|null;telegram_connected_at:string|null;chat_channel_connected_at:string|null;billing_payment_method_ready:boolean;registration_flow_completed:boolean};
export type PlanInfo={code:string;name:string;description:string;amount_minor:number|null;currency:string;interval:string;active:boolean;visible:boolean;sort_order:number;features:string[]};
type UserRow=AccountInfo;

async function currentUserRow():Promise<UserRow>{
  const {data,error}=await supabase.from('users').select('id,email,first_name,default_currency,timezone,subscription_status,subscription_plan,billing_enabled,billing_customer_id,billing_subscription_id,trial_ends_at,current_period_ends_at,access_until,beta_access,beta_access_granted_at,phone_e164,preferred_chat,chat_consent_at,whatsapp_opt_in_at,telegram_connected_at,chat_channel_connected_at,billing_payment_method_ready,registration_flow_completed').single();
  if(error) throw error;
  return data as UserRow;
}

export async function loadAccount(){return currentUserRow();}
export async function loadMonthlySpendingLimit(currency:string){const user=await currentUserRow();const now=new Date();const{data,error}=await supabase.from('monthly_spending_limits').select('amount').eq('user_id',user.id).eq('year',now.getFullYear()).eq('month',now.getMonth()+1).eq('currency',currency).maybeSingle();if(error)throw error;return data?.amount==null?null:Number(data.amount);}
export async function saveMonthlySpendingLimit(currency:string,amount:number){const user=await currentUserRow();const now=new Date();const{error}=await supabase.from('monthly_spending_limits').upsert({user_id:user.id,year:now.getFullYear(),month:now.getMonth()+1,currency,amount},{onConflict:'user_id,year,month,currency'});if(error)throw error;}
export async function listHouseholdMembers(){const{data,error}=await supabase.rpc('my_household_members');if(error)throw error;return data||[];}
export async function createHouseholdInvite(name:string,email:string){const{data,error}=await supabase.rpc('create_household_invite',{p_name:name.trim(),p_email:email.trim().toLowerCase()});if(error)throw error;return data as {token:string;expires_in_days:number};}
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
export async function validateBetaInvite(token:string,email:string){const{data,error}=await supabase.rpc('validate_beta_invite',{p_token:token.trim(),p_email:email.trim().toLowerCase()});if(error)throw error;return data===true;}
export async function saveRegistrationProfile(firstName:string,phone:string,preferredChat:'telegram'|'whatsapp',consent:boolean){const{data,error}=await supabase.rpc('save_registration_profile',{p_first_name:firstName.trim(),p_phone_e164:phone.trim(),p_preferred_chat:preferredChat,p_chat_consent:consent});if(error)throw error;return data;}
export async function startPaymentMethodSetup(){const{data,error}=await supabase.functions.invoke('stripe-setup',{body:{}});if(error)throw error;if(data?.ready)return {ready:true};if(!data?.url)throw new Error(data?.error||'Não foi possível abrir a etapa segura do cartão.');window.location.assign(data.url);return {ready:false};}
export async function connectChatChannel(channel:'telegram'|'whatsapp'){const{data,error}=await supabase.functions.invoke('chat-connect',{body:{action:channel}});if(error)throw error;if(data?.url)window.location.assign(data.url);return data;}
export async function startSubscriptionCheckout(plan='standard'){const{data,error}=await supabase.functions.invoke('stripe-checkout',{body:{plan}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Checkout indisponível.');window.location.assign(data.url);}
export async function openBillingPortal(){const{data,error}=await supabase.functions.invoke('stripe-portal',{body:{}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Portal de cobrança indisponível.');window.location.assign(data.url);}
function monthWindow(now:Date){
  const year=now.getFullYear(),month=now.getMonth();
  return {year,month:month+1,start:new Date(year,month,1),end:new Date(year,month+1,1),days:new Date(year,month+1,0).getDate()};
}

export async function loadOverview():Promise<Overview>{
  const user=await currentUserRow();
  const now=new Date(),w=monthWindow(now);
  const{data:householdIds,error:hidError}=await supabase.rpc('my_household_user_ids');if(hidError)throw hidError;const ids=(householdIds||[]) as number[];
  const [txRes,recRes,comRes]=await Promise.all([
    supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').in('user_id',ids).gte('occurred_at',w.start.toISOString()).lt('occurred_at',w.end.toISOString()).order('occurred_at'),
    supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month').in('user_id',ids).eq('active',true).order('day_of_month'),
    supabase.from('commitments').select('id,title,starts_at').in('user_id',ids).gte('starts_at',now.toISOString()).order('starts_at').limit(10),
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
    let receitaAcumulada=0,gastoAcumulado=0;
    series[cur]=Array.from({length:w.days},(_,i)=>{const day=i+1,v=daily[cur]?.[day]||{receita:0,gasto:0};receitaAcumulada+=v.receita;gastoAcumulado+=v.gasto;return{day,receita:v.receita,gasto:v.gasto,saldo:receitaAcumulada-gastoAcumulado};});
  }
  const consolidated:Overview['summary']={};
  for(const target of ['JPY','BRL','USD','EUR']){let receita=0,gasto=0,complete=true;for(const tx of txs){let converted=Number(tx.amount);if(tx.currency!==target){const{data,error}=await supabase.rpc('fx_convert',{p_amount:Number(tx.amount),p_from:tx.currency,p_to:target,p_date:new Date(tx.occurred_at).toISOString().slice(0,10)});if(error||data==null){complete=false;break}converted=Number(data)}if(tx.kind==='receita')receita+=converted;else gasto+=converted}if(complete)consolidated[target]={receita,gasto,saldo:receita-gasto};}
  return {year:w.year,month:w.month,default_currency:user.default_currency,summary,consolidated,series,categories,
    upcoming_recurring:(recRes.data||[]).map((r:any)=>{const o=(occRes.data||[]).find((x:any)=>x.recurring_expense_id===r.id);return {...r,amount:r.amount===null?null:Number(r.amount),confirmed_amount:o?.amount==null?null:Number(o.amount)};}),
    commitments:(comRes.data||[]) as Overview['commitments']};
}

export type GardenStatus={xp:number;health:number;mood:string;last_activity:string;events:Array<{type:string;xp:number;at:string}>};
export async function loadGardenStatus():Promise<GardenStatus>{const{data,error}=await supabase.rpc('my_garden_status');if(error)throw error;return data as GardenStatus;}

export async function listTransactions(kind?:'receita'|'gasto',limit=500):Promise<Tx[]>{
  const{data:ids,error:ie}=await supabase.rpc('my_household_user_ids');if(ie)throw ie;let q=supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').in('user_id',ids||[]).order('occurred_at',{ascending:false}).limit(limit);
  if(kind)q=q.eq('kind',kind);const {data,error}=await q;if(error)throw error;
  return (data||[]).map(x=>({...x,amount:Number(x.amount)})) as Tx[];
}

function normalizeCategory(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');}
export async function listCategories(){const user=await currentUserRow();const{data,error}=await supabase.from('categories').select('id,name,is_default').eq('user_id',user.id).order('name');if(error)throw error;return data||[];}
export async function addCategory(name:string){const user=await currentUserRow();const clean=name.trim().slice(0,64);const{error}=await supabase.from('categories').upsert({user_id:user.id,name:clean,normalized_name:normalizeCategory(clean),is_default:false},{onConflict:'user_id,normalized_name'});if(error)throw error;}export async function updateTransaction(id:number,changes:Partial<Pick<Tx,'kind'|'amount'|'currency'|'category'|'description'|'occurred_at'>>){
  const patch:any={...changes};
  if(changes.category){patch.category=changes.category.trim().slice(0,64);await addCategory(patch.category);}
  if(changes.description!==undefined)patch.description=changes.description.trim().slice(0,500);
  const{data,error}=await supabase.rpc('update_household_transaction',{p_transaction_id:id,p_changes:patch});
  if(error)throw error;if(data!==true)throw new Error('Não foi possível salvar a alteração.');
}
export async function deleteTransaction(id:number){const user=await currentUserRow();const{data,error}=await supabase.from('transactions').delete().eq('id',id).eq('user_id',user.id).select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('Somente quem registrou esta movimentação pode excluí-la. Você ainda pode editar os dados financeiros compartilhados da família.');}
export async function listCommitments(){const{data:ids,error:ie}=await supabase.rpc('my_household_user_ids');if(ie)throw ie;const{data,error}=await supabase.from('commitments').select('id,title,starts_at,raw_text').in('user_id',ids||[]).gte('starts_at',new Date().toISOString()).order('starts_at').limit(100);if(error)throw error;return data||[];}
export async function listRecurring(){const{data:ids,error:ie}=await supabase.rpc('my_household_user_ids');if(ie)throw ie;const{data,error}=await supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month,active').in('user_id',ids||[]).order('day_of_month');if(error)throw error;return (data||[]).map((r:any)=>({...r,amount:r.amount===null?null:Number(r.amount)}));}
export async function setVariableRecurringAmount(id:number,value:number){const{data,error}=await supabase.rpc('set_variable_recurring_amount',{p_recurring_id:id,p_amount:value});if(error)throw error;return data;}
export async function updateAccount(changes:Partial<Pick<AccountInfo,'first_name'|'default_currency'|'timezone'>>){const user=await currentUserRow();const{error}=await supabase.from('users').update(changes).eq('id',user.id);if(error)throw error;}

export async function submitFeedback(type:string,message:string,feature='dashboard'){const{data,error}=await supabase.rpc('submit_feedback',{p_type:type,p_message:message,p_feature:feature,p_context:{surface:'dashboard'}});if(error)throw error;return data;}
export async function listMyFeedback(){const{data,error}=await supabase.rpc('my_feedback');if(error)throw error;return data||[];}

export async function isAdmin(){const{data,error}=await supabase.rpc('is_planeja_admin');if(error)throw error;return !!data;}
export async function adminBetaOverview(){const{data,error}=await supabase.rpc('admin_beta_overview');if(error)throw error;return data;}
export async function adminFeedbackList(){const{data,error}=await supabase.rpc('admin_feedback_list');if(error)throw error;return data||[];}
export async function adminBetaUsers(){const{data,error}=await supabase.rpc('admin_beta_users');if(error)throw error;return data||[];}
export async function adminPulseSummary(){const{data,error}=await supabase.rpc('admin_pulse_summary');if(error)throw error;return data||[];}
export async function adminAction(body:any){const{data,error}=await supabase.functions.invoke('beta-admin-actions-v1',{body});if(error)throw error;return data;}
