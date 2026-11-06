import { z } from 'zod';
const text = z.string().trim().min(1).max(10000);
export const evidenceSchema = z.object({ id: z.string().trim().min(1).max(100), text: text.optional(), url: z.url().refine(value => /^https?:/.test(value)).optional() }).strict().refine(value => value.text || value.url);
export const claimSchema = z.object({ key: z.string().trim().min(1).max(100), value: text, sources: z.array(z.string().min(1).max(100)).max(100), observed_at: z.iso.date().optional(), sensitive: z.boolean().optional() }).strict();
const claimsSchema = z.array(claimSchema).min(1).max(100).refine(claims => new Set(claims.map(c => c.key)).size === claims.length, 'DUPLICATE_CLAIM');
export const draftSchema = z.object({ summary: text, claims: claimsSchema }).strict();
export const reviewSchema = z.object({ seatId: z.string().trim().min(1).max(100).refine(id => id !== 'generator'), summary: text, claims: claimsSchema, blockers: z.array(text).max(100) }).strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Review = z.infer<typeof reviewSchema>;
export const DILIGENCE_AGREEMENT_THRESHOLD = 2 / 3;
// Conservative text guard supplements structured sensitive flags from seats.
const sensitiveText = /(认证|独家|唯一授权|精确报价|certifi|exclusiv|(?:报价|单价|价格|price|quote|USD|CNY|EUR|[$¥€])[^\n]{0,30}\d)/i;
export function validateReferences(claims: z.infer<typeof claimSchema>[], evidence: Evidence[]) {
    const ids = new Set(evidence.map(e => e.id));
    if (ids.size !== evidence.length || claims.some(c => c.sources.some(id => !ids.has(id))))
        throw Error('INVALID_EVIDENCE');
}
const isActivityKey = (key: string) => key === 'website_last_update' || key === 'social_last_update' || key.startsWith('social_last_update:');
export function fuseDiligence(rawDraft: Draft, rawReviews: Review[], rawEvidence: Evidence[], threshold = DILIGENCE_AGREEMENT_THRESHOLD, asOf = new Date()) {
    const draft = draftSchema.parse(rawDraft);
    const reviews = z.array(reviewSchema).max(20).parse(rawReviews);
    const evidence = z.array(evidenceSchema).max(100).parse(rawEvidence);
    if (threshold <= 0 || threshold > 1 || !Number.isFinite(threshold))
        throw Error('INVALID_THRESHOLD');
    if (new Set(reviews.map(r => r.seatId)).size !== reviews.length)
        throw Error('DUPLICATE_SEAT');
    const seats = [draft, ...reviews];
    const blockers = reviews.flatMap(r => r.blockers.map(b => `${r.seatId} ${b}`));
    for (const seat of seats) {
        validateReferences(seat.claims, evidence);
        for (const claim of seat.claims) {
            if (!isActivityKey(claim.key) && /未知|待核实|待人工核查|unknown|unverified/i.test(claim.value))
                blockers.push(`待核实 ${claim.key} ${claim.value}`);
            if ((claim.sensitive || sensitiveText.test(`${claim.key} ${claim.value}`)) && !claim.sources.length)
                blockers.push(`无来源敏感声明 ${claim.key} ${claim.value}`);
        }
        // A free-text sensitive assertion cannot borrow a citation from another claim.
        if (sensitiveText.test(seat.summary) && !seat.claims.some(c => c.value === seat.summary && c.sources.length))
            blockers.push(`摘要敏感声明须逐项提供来源 ${seat.summary}`);
    }
    if (!reviews.length)
        blockers.push('缺少独立审计席');
    const lines: string[] = [];
    const ratios: number[] = [];
    // UTC calendar days: the boundary day remains fresh regardless of time of day.
    if (!Number.isFinite(asOf.getTime())) throw Error('INVALID_AS_OF');
    const today = Date.parse(asOf.toISOString().slice(0, 10));
    const fresh = (claim: z.infer<typeof claimSchema>, window: number) => {
        const age = (today - (claim.observed_at ? Date.parse(claim.observed_at) : NaN)) / 86_400_000;
        return claim.sources.length > 0 && Number.isFinite(age) && age >= 0 && age <= window
            && !/absent|无官网|无社媒|不存在|未知|待核实|unknown|unverified/i.test(claim.value);
    };
    const activityClaims = seats.flatMap(s => s.claims.filter(c => isActivityKey(c.key)));
    const strongChannel = (key: string, window: number) => {
        const claims = activityClaims.filter(c => c.key === key);
        return claims.length > 0 && claims.every(c => fresh(c, window))
            && new Set(claims.map(c => c.value)).size === 1;
    };
    const activity_tier = strongChannel('website_last_update', 180)
        && activityClaims.some(c => c.key !== 'website_last_update' && strongChannel(c.key, 90)) ? 'strong' as const : 'unknown' as const;
    const keys = [...new Set(seats.flatMap(s => s.claims.map(c => c.key)))].sort();
    for (const key of keys) {
        const candidates = seats.flatMap(s => s.claims.filter(c => c.key === key));
        if (isActivityKey(key)) {
            // Activity is a bonus, never a negative vote in business agreement.
            const sources = [...new Set(candidates.flatMap(c => c.sources))].sort();
            lines.push(`${key} ${[...new Set(candidates.map(c => c.value))].sort().join(' / ')}${sources.length ? ` [来源 ${sources.join(', ')}]` : ''}`);
            continue;
        }
        const values = [...new Set(candidates.map(c => c.value))];
        const ranked = values.map(value => ({ value, count: candidates.filter(c => c.value === value).length, sources: [...new Set(candidates.filter(c => c.value === value).flatMap(c => c.sources))].sort() }))
            .sort((a, b) => Number(b.sources.length > 0) - Number(a.sources.length > 0) || b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
        const chosen = ranked[0];
        ratios.push(chosen.count / seats.length);
        const inference = chosen.count >= 2 ? '[多席一致]' : '[单席推断]';
        const provenance = chosen.sources.length ? `[来源 ${chosen.sources.join(', ')}]` : inference;
        lines.push(`${key} ${chosen.value} ${provenance}`);
        if (values.length > 1) {
            blockers.push(`证据分歧 ${key}`);
            lines.push(`待核实 ${key} ${ranked.map(c => c.value).join(' / ')}`);
        }
    }
    const agreement_ratio = ratios.length ? Math.min(...ratios) : 1;
    const uniqueBlockers = [...new Set(blockers)].sort();
    const highConfidence = agreement_ratio >= threshold && uniqueBlockers.length === 0;
    lines.push(activity_tier === 'strong'
        ? `活跃信号强${highConfidence ? '，其他条件达标，倾向潜在客户' : '，仍须核实其他条件'}`
        : '活跃度未知，建议人工补证');
    return {
        activity_tier,
        summary: lines.join('\n'),
        agreement_ratio,
        confidence: highConfidence && activity_tier === 'strong' ? 'high' as const : 'low' as const,
        status: highConfidence ? 'auto_accepted' as const : 'needs_human' as const,
        blockers: uniqueBlockers,
        evidence,
    };
}
export type SeatContext = {
    leadId: string;
    evidence: Evidence[];
};
export interface DiligenceSeat<T> {
    id: string;
    run(context: SeatContext, draft?: Draft): Promise<T>;
}
export function fixtureSeat<T>(id: string, output: T): DiligenceSeat<T> { return { id, async run() { return structuredClone(output); } }; }
export async function runDiligenceSeats(context: SeatContext, generator: DiligenceSeat<Draft>, auditors: DiligenceSeat<Review>[]) {
    if (generator.id !== 'generator' || !auditors.length || new Set([generator.id, ...auditors.map(s => s.id)]).size !== auditors.length + 1)
        throw Error('INVALID_SEATS');
    const draft = draftSchema.parse(await generator.run(context));
    const reviews: Review[] = [];
    for (const seat of auditors) {
        const review = reviewSchema.parse(await seat.run(context, draft));
        if (review.seatId !== seat.id)
            throw Error('INVALID_SEAT');
        reviews.push(review);
    }
    return { draft, reviews };
}
