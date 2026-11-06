import React from 'react';
import {z} from 'zod';
export const observationDTO=z.object({
 timeline:z.array(z.object({seq:z.number(),role_code:z.string(),action:z.string(),state:z.string(),evidence_summary:z.string(),duration_ms:z.number().nullable()})),
 usage:z.object({source:z.string(),currency:z.literal('USD'),calls:z.number(),input_tokens:z.number(),output_tokens:z.number(),estimated_usd_micros:z.number()}),
});
export function RunObservation({timeline,usage}:z.infer<typeof observationDTO>){
 return <section><h3>步骤时间线（只读）</h3><p>耗时为开始／前一步记录到当前步骤记录的间隔，包含等待时间；不是模型执行耗时。缺少时间时显示未知。</p>
 <table><thead><tr>{['序号','岗位','命令','状态','证据摘要（ID）','记录间隔'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{timeline.map(s=><tr key={s.seq}><td>{s.seq}</td><td>{s.role_code}</td><td>{s.action}</td><td>{s.state}</td><td><code>{s.evidence_summary}</code></td><td>{s.duration_ms===null?'未知':`${s.duration_ms} ms`}</td></tr>)}</tbody></table>
 {!timeline.length&&<p>暂无步骤记录。</p>}
 <h3>Token / 费用摘要</h3><p>{usage.source==='placeholder'?'占位汇总：尚未接入本 run 的模型调用账本；0 不代表真实账单。':'调用记录估算，非生产账单。'}</p>
 <p>调用 {usage.calls} · 输入 token {usage.input_tokens} · 输出 token {usage.output_tokens} · 估算费用 {usage.currency} {(usage.estimated_usd_micros/1_000_000).toFixed(6)}</p></section>;
}
