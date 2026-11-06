export type HiddenInputState={value:string;escape:string;paste:boolean;done:boolean;cancelled:boolean;controlsRemoved:boolean};
export function hiddenInputState():HiddenInputState{return {value:'',escape:'',paste:false,done:false,cancelled:false,controlsRemoved:false};}
export function consumeHiddenInput(state:HiddenInputState,chunk:string):HiddenInputState{
 const next={...state};
 for(const c of chunk){
  if(next.done||next.cancelled)break;
  if(c==='\u0003'){next.cancelled=true;break;}
  if(next.escape){
   next.escape+=c;
   if(/^\x1b(?:\[[0-9;?]*[A-Za-z~]|O[A-Za-z])$/.test(next.escape)){
    if(next.escape==='\x1b[200~')next.paste=true;
    if(next.escape==='\x1b[201~')next.paste=false;
    next.escape='';next.controlsRemoved=true;
   }else if(next.escape.length>32||c==='\r'||c==='\n')throw new Error('TERMINAL_INPUT_INVALID');
   continue;
  }
  if(c==='\x1b'){next.escape=c;continue;}
  if(c==='\r'||c==='\n'){if(next.paste)throw new Error('MULTILINE_INPUT');next.done=true;break;}
  if(c==='\u007f'||c==='\b')next.value=[...next.value].slice(0,-1).join('');
  else if(c>=' ')next.value+=c;
  else next.controlsRemoved=true;
 }
 return next;
}
