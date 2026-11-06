export const roles=['admin','sales','operations'] as const;
export type Role=typeof roles[number];
export const ROLE_LABELS:Record<Role,string>={admin:'管理员',sales:'业务员',operations:'运营'};
export const ROLE_DESCRIPTIONS:Record<Role,string>={admin:'公司配置、成员管理和全部共享资料',sales:'维护本人客户，查看共享产品资料',operations:'查看已分配客户和共享产品资料'};
export const PERMISSIONS=[
 {label:'客户资料',admin:'全部读写',sales:'本人客户读写 / 共享客户只读',operations:'本人或共享客户只读'},
 {label:'产品资料与 HS 编码',admin:'维护与查看',sales:'查看',operations:'查看'},
 {label:'产品采购成本',admin:'查看',sales:'无权限',operations:'无权限'},
 {label:'供应商资料',admin:'维护与查看',sales:'无权限',operations:'无权限'},
 {label:'成员与角色管理',admin:'管理（需双重验证）',sales:'无权限',operations:'无权限'},
 {label:'成员操作记录',admin:'查看',sales:'无权限',operations:'无权限'}
];
