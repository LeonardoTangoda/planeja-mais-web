import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 10000);
const FUNCTION_URL = 'https://gsnnrcpnoxfzxhezmtyc.supabase.co/functions/v1/agent-core-demo';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzbm5yY3Bub3hmenhoZXptdHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDI5NjUsImV4cCI6MjEwNDUxODk2NX0.RIT4xBzQGCABe2XG7zm8u9KO244GNiQreBwsenbKOT0';

const escapeXml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const sessionFor=from=>'tw_'+crypto.createHash('sha256').update(String(from)).digest('hex').slice(0,32);

async function callAgent(session_id,text){
  const r=await fetch(FUNCTION_URL,{method:'POST',headers:{'content-type':'application/json','apikey':ANON_KEY,'authorization':'Bearer '+ANON_KEY},body:JSON.stringify({session_id,text})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||('agent_http_'+r.status));
  return j;
}

http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health'){
    res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,service:'agent-core-whatsapp-bridge'}));
  }
  if(req.method!=='POST'||!String(req.url).startsWith('/twilio')){
    res.writeHead(404,{'content-type':'text/plain'});return res.end('Not found');
  }
  try{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)throw new Error('payload_too_large')}
    const p=new URLSearchParams(raw),from=p.get('From')||'',body=(p.get('Body')||'').trim();
    if(!from||!body){res.writeHead(200,{'content-type':'text/xml'});return res.end('<Response></Response>')}
    const out=await callAgent(sessionFor(from),body.slice(0,1000));
    res.writeHead(200,{'content-type':'text/xml; charset=utf-8'});
    res.end('<Response><Message>'+escapeXml(out.reply||'Thanks. A human can follow up with you.')+'</Message></Response>');
  }catch(e){
    console.error(e);res.writeHead(200,{'content-type':'text/xml; charset=utf-8'});
    res.end('<Response><Message>I am having trouble processing that right now. I will not make any CRM changes. Please try again shortly.</Message></Response>');
  }
}).listen(PORT,'0.0.0.0',()=>console.log('twilio bridge listening on',PORT));
