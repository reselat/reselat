'use client';
import { formatMinor } from '@/domain/money';
import { currencyScale,type Currency } from './model';
export function Money({value,currency}:{value:string;currency:Currency}){return <span className="money">{currency} {formatMinor(BigInt(value),currencyScale[currency])}</span>;}
export function LocalNotice(){return <div className="inline-banner">本机试用：资料保存在当前浏览器，刷新保留，不会同步给其他员工。请只输入测试资料；正式业务需接入受控数据库。</div>;}
export function errorMessage(e:unknown){if(e instanceof Error){if(e.name==='ZodError')return '请检查必填字段、日期、数量和金额格式。';return e.message;}return '操作未完成，请检查输入。';}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function FormError({message}:{message:string}){return message?<p className="form-error" role="alert">{message}</p>:null;}
