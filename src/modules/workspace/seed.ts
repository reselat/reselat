import { workspaceSchema,type Workspace,type Party,type Company } from './model';
export function initialWorkspace():Workspace{
 const customer:Party={id:'customer-1',name:'Northstar Trading (FICTIONAL)',address:'100 Example Street, Vancouver, BC (TEST ADDRESS)',country:'Canada',email:'buyer@example.test',phone:'',contact:'示例联系人'};
 const company:Company={name:'Example Export Co., Ltd. (FICTIONAL)',address:'Example Road, Shanghai, China (TEST ADDRESS)',country:'China',email:'sales@example.test',phone:'',bankName:'',bankAccount:'',swift:''};
 const supplier:Party={id:'supplier-1',name:'示例供应商甲（虚构）',address:'示例工业区（测试地址）',country:'China',email:'supplier@example.test',phone:'',contact:'示例采购联系人'};
 return workspaceSchema.parse({version:2,revision:0,company,customers:[customer],suppliers:[supplier],products:[{id:'product-1',sku:'DEMO-001',nameZh:'通用工业连接件',nameEn:'Industrial connector',spec:'Standard / 20 mm',unit:'PCS',hsCode:'',origin:'China',unitPrice:'12.50',supplierId:'supplier-1',costPrice:'40',purchaseCurrency:'CNY'}],orders:[],purchases:[],shipments:[],payments:[],documents:[],checklist:[],followups:[]});
}
