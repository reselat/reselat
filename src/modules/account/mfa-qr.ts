export function mfaQrSource(qr:string):string{
 let svg=qr;
 if(qr.startsWith('data:')){
  const comma=qr.indexOf(',');
  const header=qr.slice(0,comma).toLowerCase();
  if(comma<0||!/^data:image\/svg\+xml;(?:utf-8|charset=utf-8)$/.test(header))throw new Error('二维码格式不支持，请重新绑定。');
  const payload=qr.slice(comma+1);
  try{svg=payload.trimStart().startsWith('<')?payload:decodeURIComponent(payload);}catch{throw new Error('二维码格式无效，请重新绑定。');}
 }
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
