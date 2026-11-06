const codes=new Set(['MODULE_NOT_FOUND','ENOENT','ECONNRESET','ETIMEDOUT','CONNECT_TIMEOUT','CONNECTION_CLOSED','CONNECTION_ENDED']);
export type ArtifactStage='claim'|'signature'|'render'|'intent'|'associate'|'upload'|'complete'|'export';
export function reportArtifactFailure(location:'document.generate'|'refund.export',stage:ArtifactStage,error:unknown){
 const raw=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined,code=typeof raw==='string'&&(codes.has(raw)||/^(?:22|23|40|42|53|54|55|57|58|XX)[A-Z0-9]{3}$/.test(raw))?raw:'UNKNOWN';
 const message=error instanceof Error?error.message:'';
 const category=/pdfkit[\/]+js[\/]+standard-fonts[\/]+[A-Za-z]+\.cjs/.test(message)?'MISSING_PDF_STANDARD_FONT':message.includes('is not a function')?'NOT_A_FUNCTION':message.includes('Cannot read properties')?'MISSING_PROPERTY':/Unknown font format/i.test(message)?'FONT_FORMAT':/Font family not registered/i.test(message)?'FONT_NOT_REGISTERED':message==='单据合计与明细不符'?'TOTAL_MISMATCH':message==='单据行金额与数量单价／尾差不符'?'LINE_AMOUNT_MISMATCH':'UNCLASSIFIED';
 const errorType=error instanceof Error&&['TypeError','RangeError','ZodError','PostgresError'].includes(error.name)?error.name:'Error';
 const frames=error instanceof Error?(error.stack??'').split('\n').slice(1).flatMap(line=>{const m=line.match(/\/var\/task\/(\.next\/server\/(?:chunks\/[A-Za-z0-9_.\/-]+|app\/api\/workspace\/[A-Za-z0-9_\/-]+)\.js|node_modules\/[A-Za-z0-9@_.\/-]+\.(?:js|mjs|cjs)):(\d+):(\d+)/);return m?[{file:m[1],line:Number(m[2]),column:Number(m[3])}]:[];}).slice(0,4):[];
 console.error(JSON.stringify({event:'artifact.request.failed',location,stage,requestId:crypto.randomUUID(),code,errorType,category,frames}));
}
