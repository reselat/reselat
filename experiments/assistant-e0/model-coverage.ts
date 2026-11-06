export type CallPath={name:string;sourceRef:string;status:'controlled'|'bypasses_gateway'|'unverified'};
export function assessModelCoverage(paths:CallPath[],inventoryComplete:boolean):'eligible_for_scoped_trial'|'blocked'{
 const required=['reply','memory','compaction','background'];
 return inventoryComplete&&required.every(name=>paths.some(p=>p.name===name))&&paths.every(p=>p.sourceRef.trim()&&p.status==='controlled')?'eligible_for_scoped_trial':'blocked';
}
