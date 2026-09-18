import {normalize} from './intent-parser.js';

const MONTHS={janeiro:0,fevereiro:1,marco:2,'março':2,abril:3,maio:4,junho:5,julho:6,agosto:7,setembro:8,outubro:9,novembro:10,dezembro:11};
const HELP_WORDS=['ajuda','ajudar','me ajuda','pode me ajudar','preciso de ajuda','nao sei como','não sei como','como faco','como faço','como que eu','como lanco','como lanço','como registro','como coloco','como adiciono','como altero','como corrijo','como vejo','onde vejo','me ensina','me explica','pode explicar','consegue explicar','nao estou conseguindo','não estou conseguindo','nao to conseguindo','não tô conseguindo','duvida','dúvida'];
const TUTORIAL_WORDS=['tutorial','treinamento','passo a passo','me ensina a usar','como usar a folhinha','como usar o planeja','quero aprender a usar','rever o tutorial','refazer o tutorial','tutorial de novo','novo tutorial','como funciona a folhinha','como funciona o planeja','me mostra como funciona','me mostra tudo que da pra fazer','me mostra tudo que dá pra fazer'];
const REPORT_WORDS=['relatorio','relatório','resumo','resumo financeiro','balanco','balanço','fechamento','extrato','quanto gastei','quanto eu gastei','quanto recebi','quanto eu recebi','como foi meu mes','como foi meu mês','como foi minha semana','como estao minhas financas','como estão minhas finanças','meus gastos de hoje','meus gastos da semana','meus gastos do mes','meus gastos do mês'];

function localDay(now,tz){const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),g=k=>Number(p.find(x=>x.type===k)?.value||0);return new Date(Date.UTC(g('year'),g('month')-1,g('day')))}
function iso(d){return d.toISOString().slice(0,10)}
function plusDays(d,n){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x}
function monthEnd(y,m){return new Date(Date.UTC(y,m+1,0))}
function clean(text){return normalize(text).replace(/\s+/g,' ').trim()}

export function helpTopic(text){const n=clean(text);
  if(/\b(?:retroativ|ontem|anteontem|data antiga|data anterior|esqueci de lan[cç]ar|semana passada|mes passado)\b/.test(n))return'retroactive';
  if(/\b(?:recorrent|recorrencia|recorrência|todo mes|todos os meses|mensal|assinatura|conta fixa|se repete|repete todo)\b/.test(n))return'recurring';
  if(/\b(?:relatorio|resumo|balanco|fechamento|extrato)\b/.test(n))return'report';
  if(/\b(?:alterar|corrigir|corrig|corrijo|corrija|corrij|edita|editar|errei|valor errado|data errada|categoria errada)\b/.test(n))return'edit';
  if(/\b(?:compromisso|consulta|dentista|reuniao|agenda|agendar|horario|evento)\b/.test(n))return'commitment';
  if(/\b(?:prazo|ate dia|até dia|janela|data limite|vencimento|vence)\b/.test(n))return'deadline';
  if(/\b(?:meta|guardar|economizar|poupar|investir|juntar dinheiro)\b/.test(n))return'goal';
  if(/\b(?:receita|recebi|salario|salário|entrada|ganhei|reembolso|estorno)\b/.test(n))return'income';
  if(/\b(?:gasto|despesa|paguei|pagamento|compra|comprei|mercado|restaurante)\b/.test(n))return'expense';
  if(/\b(?:categoria|categorizar|classificar)\b/.test(n))return'category';
  return null;
}
export function helpAnswer(topic){
  const answers={
    retroactive:'Claro. Para lançar algo de uma data anterior, diga normalmente o que foi, o valor e quando aconteceu. Ex.: “McDonalds ontem 1800”, “mercado dia 5 3200” ou “paguei 9000 de farmácia em 12/08”. Eu registro na data informada, não na data de hoje. 🍃',
    recurring:'Para algo recorrente, diga a frequência na própria frase. Ex.: “pago 90000 de aluguel todo mês” ou “internet 4500 todo dia 27”. Eu entendo que se repete e organizo como recorrência. 🍃',
    report:'Você pode pedir naturalmente: “me dá meu relatório de hoje”, “como foi minha semana?” ou “quero o relatório do mês”. Também entendo períodos anteriores, como “relatório da semana passada” ou “relatório de agosto”. 🍃',
    edit:'Depois de registrar uma movimentação, use o botão “Alterar transação” que aparece junto da confirmação. Aí você pode corrigir valor, descrição, categoria ou data sem criar outro lançamento. 🍃',
    commitment:'Diga o compromisso com data e horário do seu jeito. Ex.: “dentista amanhã 15h”, “reunião dia 20 às 9 e meia” ou “consulta daqui a 2 dias às 14h”. 🍃',
    deadline:'Para prazos, diga até quando ou a janela disponível. Ex.: “preciso pagar o imposto até dia 30”, “tenho 25 dias pra fazer a prova” ou “posso fazer do dia 20 ao 30”. 🍃',
    goal:'Para uma meta, diga quanto quer guardar por mês. Ex.: “quero guardar 50000 por mês”, “economizar 50k mensalmente” ou “quero investir 15 mil ienes todos os meses”. 🍃',
    income:'Para receitas, conte como o dinheiro entrou. Ex.: “recebi 317000 de salário”, “entrou 5000 de reembolso” ou “me pagaram 20000 ontem”. 🍃',
    expense:'Para gastos, pode falar bem curto. Ex.: “mercado 2500”, “McDonalds ontem 1800”, “gasolina 5000” ou “paguei 3200 de farmácia”. 🍃',
    category:'Você não precisa escolher a categoria sempre. Eu tento classificar automaticamente pelo contexto — mercado em alimentação, gasolina em transporte, dentista em saúde etc. Se eu errar, você pode corrigir pela alteração da transação. 🍃'
  };
  return answers[topic]||'Claro. Me conta o que você está tentando fazer ou o que não está funcionando. Pode falar normalmente, como falaria com uma pessoa; eu tento te orientar a partir do seu caso. 🍃';
}

export function isTutorialRequest(text){const n=clean(text);return TUTORIAL_WORDS.some(x=>n.includes(clean(x)))||/\b(?:quero|pode|faz|manda|me passa)\b.*\b(?:tutorial|treinamento)\b/.test(n)}
export function isHelpRequest(text){const n=clean(text),hasNumber=/\d/.test(n);return HELP_WORDS.some(x=>n.includes(clean(x)))||/^ajuda[.!?]*$/.test(n)||/\b(?:como|onde)\s+(?:eu\s+)?(?:lanco|lanço|registro|cadastro|cadastra|crio|criar|defino|definir|coloco|adiciono|altero|corrijo|vejo|faco|faço)\b/.test(n)||/\b(?:tem como|o que eu faco|o que eu faço|como funciona)\b/.test(n)||(!hasNumber&&/\b(?:esqueci de (?:lancar|lançar|registrar)|nao sei (?:lancar|lançar|registrar|colocar))\b/.test(n))}
export function isReportRequest(text){const n=clean(text);return REPORT_WORDS.some(x=>n.includes(clean(x)))||/\b(?:quero|manda|envia|passa|me passa|mostra|me da|me dê|gera|faca|faça)\b.*\b(?:relatorio|resumo|balanco|fechamento|extrato)\b/.test(n)}

function currentWeek(base){const dow=(base.getUTCDay()+6)%7,start=plusDays(base,-dow);return[start,plusDays(start,6)]}
function previousWeek(base){const [start]=currentWeek(base),end=plusDays(start,-1);return[plusDays(end,-6),end]}
function monthRange(y,m){return[new Date(Date.UTC(y,m,1)),monthEnd(y,m)]}

export function resolveReportPeriod(text,{now=new Date(),timezone='UTC'}={}){
  const n=clean(text),base=localDay(now,timezone),y=base.getUTCFullYear(),m=base.getUTCMonth();let start,end,label,period;
  if(/\bontem\b/.test(n)){start=end=plusDays(base,-1);label='ontem';period='day'}
  else{const bd=n.match(/\b(?:do\s+)?dia\s+(\d{1,2})(?![\d\/-])/);if(bd){let yy=y,mm=m,dd=Number(bd[1]);let d=new Date(Date.UTC(yy,mm,dd));if(d.getUTCMonth()!==mm||d>base){mm--;if(mm<0){mm=11;yy--}d=new Date(Date.UTC(yy,mm,dd))}if(d.getUTCDate()===dd){start=end=d;label=`dia ${dd}`;period='day'}}}
  if(!start&&/\b(?:hoje|diario|diário|deste dia)\b/.test(n)){start=end=base;label='hoje';period='day'}
  else if(/\bsemana passada\b/.test(n)){[start,end]=previousWeek(base);label='semana passada';period='week'}
  else if(/\b(?:essa semana|esta semana|dessa semana|semanal|minha semana)\b/.test(n)){[start,end]=currentWeek(base);label='esta semana';period='week'}
  else if(/\b(?:mes passado|mês passado)\b/.test(n)){let py=y,pm=m-1;if(pm<0){pm=11;py--}[start,end]=monthRange(py,pm);label='mês passado';period='month'}
  else if(/\b(?:esse mes|este mes|esse mês|este mês|mensal|meu mes|meu mês|do mes|do mês)\b/.test(n)){[start,end]=monthRange(y,m);label='este mês';period='month'}
  if(!start){const dm=n.match(/\b(?:dia\s+)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);if(dm){let yy=dm[3]?Number(dm[3]):y;if(yy<100)yy+=2000;const d=new Date(Date.UTC(yy,Number(dm[2])-1,Number(dm[1])));if(d.getUTCDate()===Number(dm[1])&&d.getUTCMonth()===Number(dm[2])-1){start=end=d;label=`dia ${dm[1]}/${dm[2]}`;period='day'}}}
  if(!start){for(const [name,idx] of Object.entries(MONTHS)){const rx=new RegExp(`\\b${name}(?:\\s+de\\s+(\\d{4}))?\\b`);const mm=n.match(rx);if(mm){const yy=mm[1]?Number(mm[1]):y;[start,end]=monthRange(yy,idx);label=`${name}${mm[1]?` de ${yy}`:''}`;period='month';break}}}
  return start?{period,start_date:iso(start),end_date:iso(end),label}:null;
}
export function naturalRequest(text,opts={}){
  if(isTutorialRequest(text))return{kind:'tutorial_request',payload:null};
  if(isReportRequest(text)){const period=resolveReportPeriod(text,opts);return{kind:'report_request',payload:period||{period:'unspecified'}}}
  if(isHelpRequest(text)){return{kind:'help_request',payload:{topic:helpTopic(text)}}}
  return null;
}

export function reportPeriodPrompt(){return'Claro. Você quer o relatório de hoje, desta semana ou deste mês? Se preferir, pode dizer um período anterior, como “semana passada”, “agosto” ou “dia 11/09”. 🍃'}
export function helpPrompt(){return'Claro. Me conta o que você está tentando fazer ou onde travou. Pode falar do seu jeito — por exemplo, que quer lançar algo antigo, criar uma recorrência, corrigir um lançamento, pedir um relatório, organizar um compromisso ou uma meta. 🍃'}
