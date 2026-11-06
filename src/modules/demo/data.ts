export const orders = [
 {id:'SO-20261023-001',customer:'Northstar Trading（虚构）',country:'加拿大',status:'采购执行中',tone:'blue',quantity:1000,received:600,delivery:'2026-11-12',next:'跟进剩余到货',price:'12.50'},
 {id:'SO-20261022-002',customer:'Harbor Supply（虚构）',country:'澳大利亚',status:'待确认',tone:'amber',quantity:500,received:0,delivery:'2026-11-18',next:'核对付款条件',price:'8.40'},
 {id:'SO-20261021-003',customer:'Atlas Distribution（虚构）',country:'阿联酋',status:'备货中',tone:'green',quantity:800,received:800,delivery:'2026-11-06',next:'补齐装箱资料',price:'6.20'},
 {id:'SO-20261020-004',customer:'Northstar Trading（虚构）',country:'加拿大',status:'草稿',tone:'gray',quantity:300,received:0,delivery:'2026-11-25',next:'确认商品规格',price:'12.50'},
];
export const customers = [
 {id:'C001',name:'Northstar Trading（虚构）',country:'加拿大',city:'温哥华',stage:'采购执行',owner:'示例业务员',initial:'N',next:'2026-10-23',note:'确认外箱唛头与首批出运安排'},
 {id:'C002',name:'Harbor Supply（虚构）',country:'澳大利亚',city:'悉尼',stage:'报价洽谈',owner:'示例业务员',initial:'H',next:'2026-10-24',note:'等待客户确认付款条件'},
 {id:'C003',name:'Atlas Distribution（虚构）',country:'阿联酋',city:'迪拜',stage:'订单执行',owner:'示例业务员',initial:'A',next:'2026-10-25',note:'整理包装尺寸及出运清单'},
];
export const products = [
 {sku:'DEMO-001',name:'通用工业连接件',english:'Industrial connector — demonstration item',spec:'标准型 / 20 mm',unit:'件',supplier:'示例供应商甲',hs:'待人工核验'},
 {sku:'DEMO-002',name:'连接件配套组件',english:'Connector accessory — demonstration item',spec:'配套型 / 25 mm',unit:'件',supplier:'示例供应商乙',hs:'待人工核验'},
];
