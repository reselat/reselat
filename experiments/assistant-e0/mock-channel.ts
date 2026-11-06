import type {Binding,Message,SendAttempt,Receipt} from './channel';
// E0 only: memory is not durable deduplication or proof of desktop takeover atomicity.
export class MockChannel {
 private readonly binding:Binding;
 private seen=new Set<string>();
 private attempts=new Map<string,{fingerprint:string;receipt:Receipt}>();
 private connected=true;
 private paused=false;
 private version=0;
 private next:Receipt['state']='sent';
 constructor(binding:Binding){this.binding={...binding};}
 private matches(b:Binding){return b.companyId===this.binding.companyId&&b.accountId===this.binding.accountId&&b.conversationId===this.binding.conversationId;}
 receive(m:Message):'accepted'|'duplicate'|'rejected'{
  if(!this.connected||!this.matches(m.binding)||!m.externalId.trim())return 'rejected';
  if(this.seen.has(m.externalId))return 'duplicate';this.seen.add(m.externalId);return 'accepted';
 }
 takeover(){this.paused=true;return ++this.version;}
 disconnect(){this.connected=false;}
 reconnect(binding:Binding){this.connected=this.matches(binding);return this.connected;}
 setNextOutcome(state:Receipt['state']){this.next=state;}
 async send(a:SendAttempt):Promise<Receipt>{
  const rejected:Receipt={attemptId:a.id,state:'rejected'};
  if(!this.matches(a.binding)||!a.id.trim())return rejected;
  const fingerprint=JSON.stringify([a.binding.companyId,a.binding.accountId,a.binding.conversationId,a.takeoverVersion,a.text]);
  const old=this.attempts.get(a.id);if(old)return old.fingerprint===fingerprint?{...old.receipt}:rejected;
  const state=!this.connected||this.paused||a.takeoverVersion!==this.version?'rejected':this.next;
  const receipt:Receipt={attemptId:a.id,state,...(state==='sent'?{externalId:'mock:'+a.id}:{})};
  this.attempts.set(a.id,{fingerprint,receipt});this.next='sent';return {...receipt};
 }
}
