import {expect,it,vi} from 'vitest';
import {reportDatabaseFailure} from '../src/server/db/diagnostics';
it('records only a fixed location, generated request ID and allowlisted error code',()=>{
 const output=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  reportDatabaseFailure('records.read',Object.assign(new Error('PRIVATE payload password'),{code:'42P18',query:'PRIVATE SQL',parameters:['PRIVATE']}));
  const line=String(output.mock.calls[0][0]);
  expect(JSON.parse(line)).toMatchObject({event:'database.request.failed',location:'records.read',code:'42P18'});
  expect(line).not.toContain('PRIVATE');expect(line).not.toContain('password');
 }finally{output.mockRestore();}
});
it('does not echo arbitrary error names or codes',()=>{
 const output=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  reportDatabaseFailure('records.read',{code:'PRIVATE_CREDENTIAL',message:'PRIVATE'});
  expect(JSON.parse(String(output.mock.calls[0][0])).code).toBe('UNKNOWN');
  expect(String(output.mock.calls[0][0])).not.toContain('PRIVATE');
 }finally{output.mockRestore();}
});
it('classifies standard SQLSTATE codes and driver undefined parameters without error messages',()=>{
 const output=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  for(const code of ['42601','26000','0A000','UNDEFINED_VALUE']){
   reportDatabaseFailure('records.read',{code,message:'PRIVATE'});
   expect(JSON.parse(String(output.mock.calls.at(-1)?.[0])).code).toBe(code);
  }
 }finally{output.mockRestore();}
});
it('extracts only packaged source coordinates from a TypeError stack',()=>{
 const output=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  const error=new TypeError('PRIVATE is not a function');
  error.stack='TypeError: PRIVATE\n    at PRIVATE (/var/task/.next/server/chunks/1234.js:1:234)\n    at PRIVATE (/private/PRIVATE.js:1:2)';
  reportDatabaseFailure('records.read',error);
  const line=String(output.mock.calls[0][0]);
  expect(JSON.parse(line)).toMatchObject({category:'NOT_A_FUNCTION',frames:[{file:'chunks/1234.js',line:1,column:234}]});
  expect(line).not.toContain('PRIVATE');
 }finally{output.mockRestore();}
});
