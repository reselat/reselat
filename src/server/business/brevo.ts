export function brevoConfiguration(){
 const key=process.env.BREVO_API_KEY;
 const email=process.env.BREVO_SENDER_EMAIL;
 if(!key||!email||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('BREVO_CONFIG_REQUIRED');
 return {key,sender:{email,name:process.env.BREVO_SENDER_NAME||'Trade outreach'}};
}
export async function sendBrevo(input:{email:string;subject:string;body:string;tags:string[]}){
 const {key,sender}=brevoConfiguration();
 try{
 const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'content-type':'application/json'},body:JSON.stringify({sender,to:[{email:input.email}],subject:input.subject,textContent:input.body,tags:input.tags}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('BREVO_REJECTED');
 const receipt=await response.json();
 if(typeof receipt.messageId!=='string'||!receipt.messageId)throw Error('BREVO_RESULT_UNKNOWN');
 return receipt.messageId as string;
 }catch(error){if(error instanceof Error&&error.message==='BREVO_REJECTED')throw error;throw Error('BREVO_RESULT_UNKNOWN');}
}
