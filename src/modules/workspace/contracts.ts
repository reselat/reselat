import { contractInputSchema,tradeDocumentSchema,type ContractInput,type Workspace,type TradeDocument } from './model';
import { buildTradeDocument } from './operations';
export function buildSalesContract(state:Workspace,orderId:string,input:ContractInput):TradeDocument{
 const data=contractInputSchema.parse(input),base=buildTradeDocument(state,orderId,'PI');
 if(data.date<base.date)throw new Error('合同日期不得早于订单日期');
 const {number,date,...terms}=data;
 return tradeDocumentSchema.parse({...base,type:'SC',number,date,contract:{...terms,status:'unsigned'}});
}
export const contractFields=[['signingPlace','签约地点 / Signing place'],['quality','质量与技术标准 / Quality & specification'],['packing','包装与唛头 / Packing & marks'],['shipping','装运及分批转运约定 / Shipment'],['inspection','检验、验收与索赔 / Inspection & claims'],['insurance','保险责任 / Insurance'],['breach','违约责任与救济 / Breach & remedies'],['forceMajeure','不可抗力 / Force majeure'],['disputes','适用法律与争议解决 / Law & disputes'],['effectiveness','生效条件 / Effectiveness'],['additional','补充约定及语言效力 / Additional terms & language']] as const;
