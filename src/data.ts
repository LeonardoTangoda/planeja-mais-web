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
export type AccountInfo={id:number;email:string|null;first_name:string|null;default_currency:string;timezone:string;subscription_status:string;subscription_plan:string;billing_enabled:boolean;billing_customer_id:string|null;billing_subscription_id:string|null;trial_ends_at:string|null;current_period_ends_at:string|null;access_until:string|null;beta_access:boolean;beta_access_granted_at:string|null;phone_e164:string|null;preferred_chat:'telegram'|'whatsapp'|null;chat_consent_at:string|null;whatsapp_opt_in_at:string|null;telegram_connected_at:string|null;chat_channel_connected_at:string|null;billing_payment_method_ready:boolean;registration_flow_completed:boolean;commercial_trial_started_at:string|null;commercial_trial_ends_at:string|null;commercial_trial_consumed_at:string|null;subscription_offer_code:string|null};
export type PlanInfo={code:string;name:string;description:string;amount_minor:number|null;currency:string;interval:string;active:boolean;visible:boolean;sort_order:number;features:string[]};
export type CommercialSettings={commercial_launch_enabled:boolean;self_serve_trial_enabled:boolean;trial_days:number;trial_requires_card:boolean;founder_offer_limit:number;retention_nudges_enabled:boolean};
export type CommercialOffer={code:string;plan_code:string;name:string;description:string;amount_minor:number;currency:string;interval:'month'|'year';trial_days:number;founder_limit:number|null;features:string[]};
type UserRow=AccountInfo;

async function currentUserRow():Promise<UserRow>{
  const {data,error}=await supabase.from('users').select('id,email,first_name,default_currency,timezone,subscription_status,subscription_plan,billing_enabled,billing_customer_id,billing_subscription_id,trial_ends_at,current_period_ends_at,access_until,beta_access,beta_access_granted_at,phone_e164,preferred_chat,chat_consent_at,whatsapp_opt_in_at,telegram_connected_at,chat_channel_connected_at,billing_payment_method_ready,registration_flow_completed,commercial_trial_started_at,commercial_trial_ends_at,commercial_trial_consumed_at,subscription_offer_code').single();
  if(error) throw error;
  return data as UserRow;
}

let householdIdsCache:{ids:number[];expiresAt:number}|null=null;
let householdIdsInFlight:Promise<number[]>|null=null;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

async function householdUserIds():Promise<number[]>{
  const now=Date.now();
  if(householdIdsCache&&householdIdsCache.expiresAt>now)return householdIdsCache.ids;
  if(householdIdsInFlight)return householdIdsInFlight;
  householdIdsInFlight=(async()=>{
    let lastError:unknown=null;
    for(let attempt=0;attempt<3;attempt++){
      const{data,error}=await supabase.rpc('my_household_user_ids');
      if(!error){
        const ids=(data||[]) as number[];
        householdIdsCache={ids,expiresAt:Date.now()+10_000};
        return ids;
      }
      lastError=error;
      if(attempt<2)await wait(250*(attempt+1));
    }
    if(lastError)throw lastError;
    throw new Error('Não foi possível carregar os membros da família.');
  })();
  try{return await householdIdsInFlight}
  finally{householdIdsInFlight=null}
}

export async function loadAccount(){return currentUserRow();}
export async function loadMonthlySpendingLimit(currency:string){const user=await currentUserRow();const now=new Date();const{data,error}=await supabase.from('monthly_spending_limits').select('amount').eq('user_id',user.id).eq('year',now.getFullYear()).eq('month',now.getMonth()+1).eq('currency',currency).maybeSingle();if(error)throw error;return data?.amount==null?null:Number(data.amount);}
export async function saveMonthlySpendingLimit(currency:string,amount:number){const user=await currentUserRow();const now=new Date();const{error}=await supabase.from('monthly_spending_limits').upsert({user_id:user.id,year:now.getFullYear(),month:now.getMonth()+1,currency,amount},{onConflict:'user_id,year,month,currency'});if(error)throw error;}
export async function listHouseholdMembers(){const{data,error}=await supabase.rpc('my_household_members');if(error)throw error;return data||[];}
export async function listHouseholdChatMembers(){const{data,error}=await supabase.rpc('my_household_chat_members');if(error)throw error;return data||[];}
export async function connectHouseholdWhatsApp(userId:number,phone:string){
  const{data,error}=await supabase.functions.invoke('chat-connect',{body:{action:'whatsapp_family',user_id:userId,phone_e164:phone}});
  if(error){let code='';try{code=(await error.context?.json())?.error||''}catch{}const messages:Record<string,string>={invalid_phone:'Informe o número com código do país e DDD.',owner_required:'Somente o titular pode gerar este link.',household_member_required:'Este membro não faz parte da sua família.',member_access_required:'O acesso deste membro está inativo.',whatsapp_phone_mismatch:'Este membro já possui outro número cadastrado.',whatsapp_already_linked:'Este número já está vinculado a outra pessoa.'};throw new Error(messages[code]||'Não consegui gerar a conexão. Tente novamente.');}
  if(!data?.url)throw new Error('Não consegui gerar o link do WhatsApp.');return data;
}
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
export async function connectChatChannel(channel:'telegram'|'whatsapp',options:{redirect?:boolean}={}){const{data,error}=await supabase.functions.invoke('chat-connect',{body:{action:channel}});if(error){let code='';try{code=(await error.context?.json())?.error||''}catch{}const messages:Record<string,string>={whatsapp_phone_missing:'Seu número de WhatsApp ainda não está salvo na conta.',whatsapp_opt_in_required:'Confirme no cadastro que você quer receber mensagens do Planeja+ no WhatsApp.'};throw new Error(messages[code]||'Não consegui conectar esse canal agora.')}if(options.redirect!==false&&data?.url&&!data?.sent)window.location.assign(data.url);return data;}
export async function startSubscriptionCheckout(offer='standard_monthly'){const{data,error}=await supabase.functions.invoke('stripe-checkout',{body:{offer,plan:'standard'}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Checkout indisponível.');window.location.assign(data.url);}
export async function openBillingPortal(){const{data,error}=await supabase.functions.invoke('stripe-portal',{body:{}});if(error)throw error;if(!data?.url)throw new Error(data?.error||'Portal de cobrança indisponível.');window.location.assign(data.url);}
export async function loadCommercialSettings():Promise<CommercialSettings|null>{const{data,error}=await supabase.from('commercial_settings').select('commercial_launch_enabled,self_serve_trial_enabled,trial_days,trial_requires_card,founder_offer_limit,retention_nudges_enabled').eq('singleton',true).maybeSingle();if(error)throw error;return data as CommercialSettings|null;}
export async function loadCommercialOffers():Promise<CommercialOffer[]>{const{data,error}=await supabase.from('commercial_offers').select('code,plan_code,name,description,amount_minor,currency,interval,trial_days,founder_limit,features').order('sort_order');if(error)throw error;return (data||[]) as CommercialOffer[];}
export async function startCommercialTrial(){const{data,error}=await supabase.rpc('start_my_commercial_trial');if(error)throw error;return data;}
export async function exportMyData(){const{data,error}=await supabase.functions.invoke('account-data-v1',{body:{action:'export'}});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
export async function deleteMyAccount(confirmText:string){const{data,error}=await supabase.functions.invoke('account-data-v1',{body:{action:'delete',confirm:confirmText}});if(error)throw error;if(data?.error)throw new Error(data.error);return data;}
function monthWindow(now:Date){
  const year=now.getFullYear(),month=now.getMonth();
  return {year,month:month+1,start:new Date(year,month,1),end:new Date(year,month+1,1),days:new Date(year,month+1,0).getDate()};
}

export async function loadOverview():Promise<Overview>{
  const user=await currentUserRow();
  const now=new Date(),w=monthWindow(now);
  const ids=await householdUserIds();
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
  const targets=Array.from(new Set([user.default_currency,...Object.keys(summary),'JPY','BRL','USD','EUR'].filter(Boolean)));
  for(const target of targets){let receita=0,gasto=0,complete=true;for(const tx of txs){let converted=Number(tx.amount);if(tx.currency!==target){const{data,error}=await supabase.rpc('fx_convert',{p_amount:Number(tx.amount),p_from:tx.currency,p_to:target,p_date:new Date(tx.occurred_at).toISOString().slice(0,10)});if(error||data==null){complete=false;break}converted=Number(data)}if(tx.kind==='receita')receita+=converted;else gasto+=converted}if(complete)consolidated[target]={receita,gasto,saldo:receita-gasto};}
  return {year:w.year,month:w.month,default_currency:user.default_currency,summary,consolidated,series,categories,
    upcoming_recurring:(recRes.data||[]).map((r:any)=>{const o=(occRes.data||[]).find((x:any)=>x.recurring_expense_id===r.id);return {...r,amount:r.amount===null?null:Number(r.amount),confirmed_amount:o?.amount==null?null:Number(o.amount)};}),
    commitments:(comRes.data||[]) as Overview['commitments']};
}

export type GardenStatus={xp:number;care_points:number;health:number;mood:string;hydration:number;cleanliness:number;nutrition:number;happiness:number;flowers:number;last_activity:string;events:Array<{type:string;xp:number;at:string}>;care_actions:Array<{action:string;cost:number;at:string}>;achievements:Array<{key:string;at:string}>};
export async function loadGardenStatus():Promise<GardenStatus>{const{data,error}=await supabase.rpc('my_garden_status');if(error)throw error;return data as GardenStatus;}
export async function careForGarden(action:'water'|'clean'|'fertilize'|'play'){const{data,error}=await supabase.rpc('care_for_my_garden',{p_action:action});if(error){if(String(error.message).includes('not_enough_care_points'))throw new Error('Você ainda não tem energia de cuidado suficiente. Organize algo no Planeja+ para ganhar mais. ✨');throw error}return data;}
export async function recordSavingsWin(amount:number,currency:string,note=''){const{data,error}=await supabase.rpc('record_my_savings_win',{p_amount:amount,p_currency:currency,p_note:note});if(error)throw error;return data;}


export async function listTransactions(kind?:'receita'|'gasto',limit=500):Promise<Tx[]>{
  const ids=await householdUserIds();let q=supabase.from('transactions').select('id,kind,amount,currency,category,description,occurred_at,source').in('user_id',ids||[]).order('occurred_at',{ascending:false}).limit(limit);
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
export async function listCommitments(){const ids=await householdUserIds();const{data,error}=await supabase.from('commitments').select('id,title,starts_at,raw_text').in('user_id',ids||[]).gte('starts_at',new Date().toISOString()).order('starts_at').limit(100);if(error)throw error;return data||[];}
export async function listRecurring(){const ids=await householdUserIds();const{data,error}=await supabase.from('recurring_expenses').select('id,description,amount,currency,category,day_of_month,active').in('user_id',ids||[]).order('day_of_month');if(error)throw error;return (data||[]).map((r:any)=>({...r,amount:r.amount===null?null:Number(r.amount)}));}
export async function setVariableRecurringAmount(id:number,value:number){const{data,error}=await supabase.rpc('set_variable_recurring_amount',{p_recurring_id:id,p_amount:value});if(error)throw error;return data;}
export async function updateAccount(changes:Partial<Pick<AccountInfo,'first_name'|'default_currency'|'timezone'>>){const user=await currentUserRow();const{error}=await supabase.from('users').update(changes).eq('id',user.id);if(error)throw error;}

export async function submitFeedback(type:string,message:string,feature='dashboard'){const{data,error}=await supabase.rpc('submit_feedback',{p_type:type,p_message:message,p_feature:feature,p_context:{surface:'dashboard'}});if(error)throw error;return data;}
export async function listMyFeedback(){const{data,error}=await supabase.rpc('my_feedback');if(error)throw error;return data||[];}

export async function isAdmin(){const{data,error}=await supabase.rpc('is_planeja_admin');if(error)throw error;return !!data;}
export async function adminBetaOverview(){const{data,error}=await supabase.rpc('admin_beta_overview');if(error)throw error;return data;}
export async function adminFeedbackList(){const{data,error}=await supabase.rpc('admin_feedback_list');if(error)throw error;return data||[];}
export async function adminBetaUsers(){const{data,error}=await supabase.rpc('admin_beta_users');if(error)throw error;return data||[];}
export async function adminPulseSummary(){const{data,error}=await supabase.rpc('admin_pulse_summary');if(error)throw error;return data||[];}
export async function adminSaasOverview(days=30){const{data,error}=await supabase.rpc('admin_saas_overview',{p_days:days});if(error)throw error;return data||{};}
export async function adminAction(body:any){const{data,error}=await supabase.functions.invoke('beta-admin-actions-v1',{body});if(error)throw error;return data;}

export type CreditCard={id:number;user_id:number;name:string;currency:string;credit_limit:number;closing_day:number;due_day:number;active:boolean;recurring_expense_id:number|null;owner_name?:string;current_due_date:string;current_total:number;registered_usage:number;override_amount:number|null;purchases:Array<{id:number;amount:number;currency:string;category:string;description:string;purchased_at:string;statement_due_date:string;source:string;installment_group_id:string|null;installment_number:number;installment_count:number;original_total:number}>};
export async function listCreditCards():Promise<CreditCard[]>{
  const userIds=await householdUserIds();
  const{data:cards,error}=await supabase.from('credit_cards').select('id,user_id,name,currency,credit_limit,closing_day,due_day,active,recurring_expense_id').in('user_id',userIds).eq('active',true).order('created_at');if(error)throw error;
  if(!cards?.length)return[];const cardIds=cards.map((c:any)=>c.id);const today=new Date().toISOString().slice(0,10);
  const[pur,ov,members]=await Promise.all([
    supabase.from('credit_card_purchases').select('id,user_id,credit_card_id,amount,currency,category,description,purchased_at,statement_due_date,source,installment_group_id,installment_number,installment_count,original_total').in('credit_card_id',cardIds).order('purchased_at',{ascending:false}).limit(500),
    supabase.from('credit_card_statement_overrides').select('credit_card_id,due_date,amount').in('credit_card_id',cardIds),
    listHouseholdMembers().catch(()=>[])
  ]);if(pur.error)throw pur.error;if(ov.error)throw ov.error;
  const names=new Map((members||[]).map((m:any)=>[Number(m.user_id),String(m.first_name||m.email||'')]));
  const out:CreditCard[]=[];for(const c of cards as any[]){const rows=(pur.data||[]).filter((x:any)=>x.credit_card_id===c.id);let due=rows.map((x:any)=>x.statement_due_date).filter((d:string)=>d>=today).sort()[0];if(!due){const q=await supabase.rpc('card_statement_due_date',{p_card_id:c.id,p_purchase_date:today});if(q.error)throw q.error;due=String(q.data)}const dueRows=rows.filter((x:any)=>x.statement_due_date===due);const override=(ov.data||[]).find((x:any)=>x.credit_card_id===c.id&&x.due_date===due);const calculated=dueRows.reduce((s:number,x:any)=>s+Number(x.amount),0);const usage=rows.filter((x:any)=>x.statement_due_date>=today).reduce((s:number,x:any)=>s+Number(x.amount),0);out.push({...c,credit_limit:Number(c.credit_limit),owner_name:names.get(Number(c.user_id))||'',current_due_date:due,current_total:override?Number(override.amount):calculated,override_amount:override?Number(override.amount):null,registered_usage:usage,purchases:rows.slice(0,20).map((x:any)=>({...x,amount:Number(x.amount),installment_number:Number(x.installment_number||1),installment_count:Number(x.installment_count||1),original_total:Number(x.original_total??x.amount)}))})}return out;
}
export async function createCreditCard(input:{name:string;currency:string;credit_limit:number;closing_day:number;due_day:number}){const{data,error}=await supabase.rpc('create_credit_card',{p_name:input.name,p_currency:input.currency,p_limit:input.credit_limit,p_closing_day:input.closing_day,p_due_day:input.due_day});if(error)throw error;return Number(data)}
export async function addCreditCardPurchase(cardId:number,amount:number,category:string,description:string,purchasedAt?:string,installments=1){const at=purchasedAt||new Date().toISOString();if(installments>1){const{data,error}=await supabase.rpc('add_credit_card_installment_purchase',{p_card_id:cardId,p_total_amount:amount,p_installments:installments,p_category:category||'outros',p_description:description||'sem descrição',p_purchased_at:at,p_source:'dashboard',p_raw_text:''});if(error)throw error;return data}const{data,error}=await supabase.rpc('add_credit_card_purchase',{p_card_id:cardId,p_amount:amount,p_category:category||'outros',p_description:description||'sem descrição',p_purchased_at:at,p_source:'dashboard',p_raw_text:''});if(error)throw error;return data}
export async function setCreditCardStatementTotal(cardId:number,dueDate:string,amount:number,note='Ajuste manual pelo dashboard'){const{data,error}=await supabase.rpc('set_credit_card_statement_total',{p_card_id:cardId,p_due_date:dueDate,p_amount:amount,p_note:note});if(error)throw error;return Number(data)}
export async function updateCreditCard(cardId:number,input:{name:string;credit_limit:number;closing_day:number;due_day:number}){const{data,error}=await supabase.rpc('update_credit_card',{p_card_id:cardId,p_name:input.name,p_limit:input.credit_limit,p_closing_day:input.closing_day,p_due_day:input.due_day});if(error)throw error;return data===true}
export async function archiveCreditCard(cardId:number){const{data,error}=await supabase.rpc('archive_credit_card',{p_card_id:cardId});if(error)throw error;return data===true}

export type CategoryBudgetStatus={id:number;category:string;currency:string;monthly_limit:number;alert_threshold:number;spent:number;remaining:number;percent_used:number;period_start:string;period_end:string};
export type MonthForecast={currency:string;actual_revenue:number;actual_expense:number;net_so_far:number;future_recurring:number;future_card_statements:number;known_future_outflows:number;projected_month_net:number;unknown_future_items:number;period_start:string;period_end:string;as_of:string};
export async function listCategoryBudgets():Promise<CategoryBudgetStatus[]>{const{data,error}=await supabase.rpc('my_category_budget_statuses');if(error)throw error;return(data||[]).map((x:any)=>({...x,id:Number(x.id),monthly_limit:Number(x.monthly_limit),alert_threshold:Number(x.alert_threshold),spent:Number(x.spent),remaining:Number(x.remaining),percent_used:Number(x.percent_used)}))}
export async function setCategoryBudget(category:string,currency:string,monthlyLimit:number,alertThreshold=.75){const{data,error}=await supabase.rpc('set_category_budget',{p_category:category,p_currency:currency,p_monthly_limit:monthlyLimit,p_alert_threshold:alertThreshold});if(error)throw error;return Number(data)}
export async function deleteCategoryBudget(id:number){const{data,error}=await supabase.rpc('delete_category_budget',{p_budget_id:id});if(error)throw error;return data===true}
export async function loadMonthForecast():Promise<MonthForecast[]>{const{data,error}=await supabase.rpc('my_month_forecast');if(error)throw error;return(data||[]).map((x:any)=>({...x,actual_revenue:Number(x.actual_revenue),actual_expense:Number(x.actual_expense),net_so_far:Number(x.net_so_far),future_recurring:Number(x.future_recurring),future_card_statements:Number(x.future_card_statements),known_future_outflows:Number(x.known_future_outflows),projected_month_net:Number(x.projected_month_net),unknown_future_items:Number(x.unknown_future_items)}))}

export type FinancialPatternInsight={id:number;user_id:number;member_name:string;source_type:'transaction'|'credit_card_purchase';source_id:number;insight_type:'recurring_candidate'|'amount_spike'|'frequency_spike'|'possible_duplicate';status:'pending'|'accepted'|'dismissed';payload:Record<string,any>;created_at:string};
export async function listFinancialPatternInsights():Promise<FinancialPatternInsight[]>{const{data,error}=await supabase.rpc('my_financial_pattern_insights');if(error)throw error;return(data||[]).map((x:any)=>({...x,id:Number(x.id),user_id:Number(x.user_id),source_id:Number(x.source_id),payload:x.payload||{}}))}
export async function dismissFinancialPatternInsight(id:number){const{data,error}=await supabase.rpc('dismiss_financial_pattern_insight',{p_insight_id:id});if(error)throw error;return data===true}
export async function acceptRecurringPatternInsight(id:number){const{data,error}=await supabase.rpc('accept_recurring_pattern_insight',{p_insight_id:id});if(error)throw error;return Number(data)}

export type FamilyActivityEvent={id:number;actor_user_id:number|null;actor_name:string;subject_user_id:number|null;subject_name:string;entity_type:string;entity_id:number|null;action:'created'|'updated'|'deleted';source:string|null;metadata:Record<string,any>;created_at:string};
export async function listFamilyActivity(limit=30,offset=0):Promise<FamilyActivityEvent[]>{const{data,error}=await supabase.rpc('my_family_activity',{p_limit:limit,p_offset:offset});if(error)throw error;return(data||[]).map((x:any)=>({...x,id:Number(x.id),actor_user_id:x.actor_user_id==null?null:Number(x.actor_user_id),subject_user_id:x.subject_user_id==null?null:Number(x.subject_user_id),entity_id:x.entity_id==null?null:Number(x.entity_id),metadata:x.metadata||{}}))}

export type ShoppingListItem={id:number;list_id:number;created_by_user_id:number|null;name:string;normalized_name:string;quantity:number|null;unit:string|null;note:string|null;checked:boolean;checked_by_user_id:number|null;checked_at:string|null;position:number;created_at:string;updated_at:string};
export type ShoppingList={id:number;household_id:number|null;owner_user_id:number;created_by_user_id:number|null;name:string;status:'active'|'completed'|'archived';default_category:string;completed_amount:number|null;completed_currency:string|null;completed_at:string|null;completed_by_user_id:number|null;linked_transaction_id:number|null;linked_credit_card_purchase_id:number|null;created_at:string;updated_at:string;items:ShoppingListItem[]};
export type GrocerySpendStat={currency:string;purchase_count:number;total_spent:number;average_per_purchase:number;average_monthly:number;current_month_spent:number;last_purchase_at:string|null};
export async function listShoppingLists(includeCompleted=false):Promise<ShoppingList[]>{let q=supabase.from('shopping_lists').select('*,items:shopping_list_items(*)').order('updated_at',{ascending:false});q=includeCompleted?q.in('status',['active','completed']):q.eq('status','active');const{data,error}=await q.limit(20);if(error)throw error;return(data||[]).map((x:any)=>({...x,id:Number(x.id),owner_user_id:Number(x.owner_user_id),created_by_user_id:x.created_by_user_id==null?null:Number(x.created_by_user_id),completed_amount:x.completed_amount==null?null:Number(x.completed_amount),linked_transaction_id:x.linked_transaction_id==null?null:Number(x.linked_transaction_id),linked_credit_card_purchase_id:x.linked_credit_card_purchase_id==null?null:Number(x.linked_credit_card_purchase_id),items:(x.items||[]).map((i:any)=>({...i,id:Number(i.id),list_id:Number(i.list_id),created_by_user_id:i.created_by_user_id==null?null:Number(i.created_by_user_id),quantity:i.quantity==null?null:Number(i.quantity),checked_by_user_id:i.checked_by_user_id==null?null:Number(i.checked_by_user_id),position:Number(i.position||0)})).sort((a:any,b:any)=>Number(a.checked)-Number(b.checked)||a.position-b.position||a.id-b.id)})) as ShoppingList[]}
export async function createShoppingList(name:string,items:string[]=[]){const payload=items.map(x=>({name:x}));const{data,error}=await supabase.rpc('shopping_create_list',{p_name:name.trim()||'Lista do mercado',p_items:payload});if(error)throw error;const id=Number(data);supabase.functions.invoke('shopping-notify-v1',{body:{list_id:id}}).catch(()=>{});return id}
export async function addShoppingItem(listId:number,name:string,quantity:number|null=null,unit:string|null=null,note:string|null=null){const{data,error}=await supabase.rpc('shopping_add_item',{p_list_id:listId,p_name:name,p_quantity:quantity,p_unit:unit,p_note:note});if(error)throw error;return Number(data)}
export async function toggleShoppingItem(itemId:number,checked:boolean){const{data,error}=await supabase.rpc('shopping_toggle_item',{p_item_id:itemId,p_checked:checked});if(error)throw error;return data===true}
export async function deleteShoppingItem(itemId:number){const{data,error}=await supabase.rpc('shopping_delete_item',{p_item_id:itemId});if(error)throw error;return data===true}
export async function archiveShoppingList(listId:number){const{data,error}=await supabase.rpc('shopping_archive_list',{p_list_id:listId});if(error)throw error;return data===true}
export async function finishShoppingList(listId:number,total:number,currency:string,cardId:number|null=null){const{data,error}=await supabase.rpc('shopping_finish_list',{p_list_id:listId,p_total:total,p_currency:currency,p_card_id:cardId,p_actor_user_id:null});if(error)throw error;return data}
export async function grocerySpendStats(months=3):Promise<GrocerySpendStat[]>{const{data,error}=await supabase.rpc('my_grocery_spend_stats',{p_months:months});if(error)throw error;return(data||[]).map((x:any)=>({...x,purchase_count:Number(x.purchase_count||0),total_spent:Number(x.total_spent||0),average_per_purchase:Number(x.average_per_purchase||0),average_monthly:Number(x.average_monthly||0),current_month_spent:Number(x.current_month_spent||0)}))}
