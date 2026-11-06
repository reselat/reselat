import { expect, it, vi, afterEach } from 'vitest';
import { fuseDiligence, type Draft } from '@/modules/business/diligence-fusion';
afterEach(() => vi.useRealTimers());
const evidence = [{ id: 'web', url: 'https://example.com' }, { id: 'social', url: 'https://example.com/social' }];
function fuse(website?: string, social?: string, omitSocial = false, sourced = true) {
 vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-11-05T23:59:59Z'));
 const draft: Draft = { summary: '已核对', claims: [
  { key: 'website_last_update', value: '活跃', observed_at: website, sources: sourced ? ['web'] : [] },
  ...omitSocial ? [] : [{ key: 'social_last_update', value: '活跃', observed_at: social, sources: ['social'] }],
 ] };
 return fuseDiligence(draft, [{ ...draft, seatId: 'audit', blockers: [] }], evidence);
}
it.each([
 ['2026-05-09', '2026-08-07', 'strong'],
 ['2026-05-08', '2026-08-07', 'unknown'],
 ['2026-05-09', '2026-08-06', 'unknown'],
 [undefined, '2026-08-07', 'unknown'],
 ['2026-05-09', undefined, 'unknown'],
 ['2026-11-06', '2026-08-07', 'unknown'],
])('grades website %s and social %s as %s without veto', (web, social, tier) => {
 const result = fuse(web, social);
 expect(result).toMatchObject({ activity_tier: tier, status: 'auto_accepted' });
 if (tier === 'unknown') {
  expect(result.summary).toContain('活跃度未知，建议人工补证');
  expect(result.confidence).toBe('low');
  expect(result.blockers).toEqual([]);
 } else {
  expect(result.confidence).toBe('high');
  expect(result.summary).toContain('潜在客户');
 }
});
it('does not veto missing social or unsourced activity', () => {
 expect(fuse('2026-11-05', undefined, true)).toMatchObject({ activity_tier: 'unknown', status: 'auto_accepted' });
 expect(fuse('2026-11-05', '2026-11-05', false, false)).toMatchObject({ activity_tier: 'unknown', status: 'auto_accepted' });
});
it('accepts explicit absence and multiple social platforms without eliminating leads', () => {
 const claims = [
  { key: 'business', value: '机械', sources: [] },
  { key: 'website_last_update', value: 'absent', sources: ['web'], observed_at: '2026-11-05' },
  { key: 'social_last_update:linkedin', value: 'absent', sources: ['social'] },
 ];
 const result = fuseDiligence({ summary: '已核对', claims }, [{ summary: '已核对', claims, seatId: 'a', blockers: [] }], evidence);
 expect(result).toMatchObject({ activity_tier: 'unknown', status: 'auto_accepted', confidence: 'low' });
});
it('supports fresh platform-specific social evidence', () => {
 const claims = [
  { key: 'website_last_update', value: '更新', sources: ['web'], observed_at: '2026-11-05' },
  { key: 'social_last_update:linkedin', value: '更新', sources: ['social'], observed_at: '2026-11-05' },
  { key: 'social_last_update:facebook', value: 'absent', sources: ['social'] },
 ];
 expect(fuseDiligence({ summary: '已核对', claims }, [{ summary: '已核对', claims, seatId: 'a', blockers: [] }], evidence, undefined, new Date('2026-11-05'))).toMatchObject({ activity_tier: 'strong', status: 'auto_accepted' });
});
it('keeps legacy consensus eligible with unknown activity', () => {
 const draft = { summary: '已核对', claims: [{ key: 'business', value: '机械', sources: [] }] };
 expect(fuseDiligence(draft, [{ ...draft, seatId: 'audit', blockers: [] }], [])).toMatchObject({ activity_tier: 'unknown', status: 'auto_accepted', confidence: 'low' });
});
it('treats ordinary keys from Object.prototype as ordinary claims', () => {
 const claims = ['website_last_update', 'social_last_update', 'constructor'].map(key => ({ key, value: '已核对', observed_at: key === 'constructor' ? undefined : '2026-11-05', sources: ['web'] }));
 expect(fuseDiligence({ summary: '已核对', claims }, [{ summary: '已核对', claims, seatId: 'a', blockers: [] }], evidence, undefined, new Date('2026-11-05')).status).toBe('auto_accepted');
});

it('does not promote disputed activity to strong or high confidence', () => {
 const claims = ['website_last_update', 'social_last_update'].map(key => ({ key, value: '更新', sources: ['web'], observed_at: '2026-11-05' }));
 const result = fuseDiligence({ summary: '核对', claims }, [{ summary: '核对', seatId: 'audit', blockers: [], claims: claims.map(c => ({ ...c, value: 'absent' })) }], evidence, undefined, new Date('2026-11-05'));
 expect(result).toMatchObject({ activity_tier: 'unknown', confidence: 'low', status: 'auto_accepted' });
});
