export function assertPrecision(value:string,kind:'quantity'|'price'|'minor'){
 if(!/^\d+(?:\.\d+)?$/.test(value)||value.length>64)throw new Error('DECIMAL_INVALID');
 const [whole,fraction='']=value.split('.'),digits=whole.replace(/^0+/,'')||'0';
 if(kind==='minor'?(fraction.length>0||digits.length>38):(fraction.length>4||digits.length>20))throw new Error('DECIMAL_PRECISION');return value;
}
