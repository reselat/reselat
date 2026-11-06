import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checkAdmin } from '@/server/auth/employee';
import { draftSchema, reviewSchema, evidenceSchema, fuseDiligence, validateReferences, type Review } from '@/modules/business/diligence-fusion';
import type { BusinessActor } from './access';
import { runBusinessCommand, audit, type CommandResult } from './commands';
import { readBusiness } from './order-data';
const schemas = {
    diligence_audit_submit: z.object({ leadId: z.uuid(), draft: draftSchema.optional(), evidence: z.array(evidenceSchema).max(100).default([]) }).strict(),
    diligence_audit_record: z.object({ auditId: z.uuid(), review: reviewSchema }).strict(),
    diligence_audit_fuse: z.object({ auditId: z.uuid() }).strict(),
};
const envelope = z.object({ requestId: z.uuid(), payload: z.unknown() }).strict();
// Host/admin commands only. These are intentionally absent from MCP tool schemas.
export async function diligenceAuditCommand(actor: BusinessActor, kind: string, raw: unknown) {
    checkAdmin(actor, actor.aal);
    const input = envelope.parse(raw);
    if (!Object.hasOwn(schemas, kind))
        throw Error('INVALID_INPUT');
    const payload = schemas[kind as keyof typeof schemas].parse(input.payload);
    return runBusinessCommand(actor, { requestId: input.requestId, kind, payload }, async (tx): Promise<CommandResult> => {
        if ('leadId' in payload) {
            const lead = await tx `select id from trade_business.leads where company_id=${actor.companyId} and id=${payload.leadId}`;
            if (!lead.length)
                throw Error('NOT_FOUND');
            const draft = payload.draft ?? { summary: '未知，待人工核查', claims: [{ key: '背景', value: '未知，待人工核查', sources: [] }] };
            validateReferences(draft.claims, payload.evidence);
            const id = randomUUID();
            await tx `insert into trade_business.diligence_audits(company_id,id,lead_id,draft,evidence) values(${actor.companyId},${id},${payload.leadId},${tx.json(draft)},${tx.json(payload.evidence)})`;
            await audit(tx, actor, id, kind);
            return { id, status: 'needs_human' };
        }
        const rows = await tx `select * from trade_business.diligence_audits where company_id=${actor.companyId} and id=${payload.auditId} for update`;
        if (!rows.length)
            throw Error('NOT_FOUND');
        const task = rows[0];
        if (task.fusion || task.human_decision)
            throw Error('INVALID_TRANSITION');
        if ('review' in payload) {
            const review = reviewSchema.parse(payload.review);
            const reviews = z.array(reviewSchema).max(19).parse(task.reviews);
            if (reviews.some((r: Review) => r.seatId === review.seatId))
                throw Error('DUPLICATE_SEAT');
            validateReferences(review.claims, z.array(evidenceSchema).parse(task.evidence));
            await tx `update trade_business.diligence_audits set reviews=${tx.json([...reviews, review])} where company_id=${actor.companyId} and id=${payload.auditId}`;
            await audit(tx, actor, payload.auditId, kind, { seat_id: review.seatId });
            return { id: payload.auditId };
        }
        // Re-evaluate freshness at fusion time; never trust a seat-provided status or clock.
        const fusion = fuseDiligence(task.draft, task.reviews, task.evidence, undefined, new Date());
        const reportId = fusion.status === 'auto_accepted' ? randomUUID() : null;
        if (reportId)
            await tx `insert into trade_business.diligence_reports(company_id,id,lead_id,summary) values(${actor.companyId},${reportId},${task.lead_id},${fusion.summary})`;
        await tx `update trade_business.diligence_audits set fusion=${tx.json(fusion)},status=${fusion.status},report_id=${reportId} where company_id=${actor.companyId} and id=${payload.auditId}`;
        await audit(tx, actor, payload.auditId, kind, { status: fusion.status, agreement_ratio: fusion.agreement_ratio, report_id: reportId });
        return { id: payload.auditId, status: fusion.status, reportId };
    });
}
// Called exclusively by authenticated session HTTP, never by an Agent/Host MCP command.
export async function humanDiligenceDecision(actor: BusinessActor, raw: unknown) {
    checkAdmin(actor, actor.aal);
    const input = z.object({ requestId: z.uuid(), payload: z.object({ auditId: z.uuid(), decision: z.enum(['accept', 'reject']), human_actor_id: z.uuid() }).strict() }).strict().parse(raw);
    if (input.payload.human_actor_id !== actor.id)
        throw Error('INVALID_INPUT');
    return runBusinessCommand(actor, { ...input, kind: 'diligence_audit_decide' }, async (tx) => {
        const rows = await tx `select * from trade_business.diligence_audits where company_id=${actor.companyId} and id=${input.payload.auditId} for update`;
        if (!rows.length)
            throw Error('NOT_FOUND');
        const task = rows[0];
        if (task.status !== 'needs_human' || !task.fusion || task.human_decision || task.report_id)
            throw Error('INVALID_TRANSITION');
        const reportId = input.payload.decision === 'accept' ? randomUUID() : null;
        if (reportId)
            await tx `insert into trade_business.diligence_reports(company_id,id,lead_id,summary) values(${actor.companyId},${reportId},${task.lead_id},${task.fusion.summary})`;
        const status = reportId ? 'needs_human' : 'rejected_by_policy';
        await tx `update trade_business.diligence_audits set status=${status},human_decision=${input.payload.decision},human_actor_id=${actor.id},report_id=${reportId} where company_id=${actor.companyId} and id=${task.id}`;
        await audit(tx, actor, task.id, 'diligence_audit_decide', { human_actor_id: actor.id, decision: input.payload.decision, report_id: reportId });
        return { id: task.id, status, reportId };
    });
}
export async function diligenceAuditList(actor: BusinessActor) {
    checkAdmin(actor, actor.aal);
    return readBusiness(actor, async (db) => ({ items: await db `select id,lead_id,draft,evidence,reviews,fusion,status,human_decision,human_actor_id,report_id,created_at from trade_business.diligence_audits where company_id=${actor.companyId} order by created_at desc,id limit 500` }));
}
