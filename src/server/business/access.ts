import {customerCompanyKeys} from '@/modules/business/customer-company';
import {checkAdmin,IdentityError,type Employee} from '@/server/auth/employee';
export type BusinessActor=Employee&{aal?:string};
export type ResourceScope={companyId:string;ownerId:string|null;operationsId?:string|null;sharedWith?:readonly string[]};
export type BusinessAction='read'|'write'|'fulfill'|'confirm';
export function assertScope(actor:BusinessActor,resource:ResourceScope,action:BusinessAction){
 if(!actor.enabled||actor.archivedAt||actor.companyId!==resource.companyId)throw new IdentityError('FORBIDDEN');
 if(actor.role==='admin'){checkAdmin(actor,actor.aal);return;}
 if(action==='confirm')throw new IdentityError('FORBIDDEN');
 if(actor.role==='operations'&&resource.operationsId===actor.id&&(action==='read'||action==='fulfill'))return;
 if(actor.role==='sales'&&resource.ownerId===actor.id&&(action==='read'||action==='write'))return;
 if(action==='read'&&resource.sharedWith?.includes(actor.id))return;
 throw new IdentityError('FORBIDDEN');
}
const publicProduct=['id','sku','name','nameZh','nameEn','spec','unit','hsCode','origin','unitPrice','declarationName','declarationElements','taxCommodityCode','refundRate','classificationSource','classificationDate','classificationStatus'];
const publicParty=['id','name','country','address','email','phone','contact','source','referenceCode','customerStage'];
export function projectFields(payload:Record<string,unknown>,role:Employee['role'],kind:'product'|'customer'|'supplier'){
 if(role==='admin')return payload;
 if(kind==='supplier'&&role!=='operations')throw new IdentityError('FORBIDDEN');
 const allowed=kind==='product'?publicProduct:kind==='customer'?[...publicParty,...customerCompanyKeys]:publicParty;return Object.fromEntries(Object.entries(payload).filter(([key])=>allowed.includes(key)));
}
