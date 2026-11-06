// Existing consensus tests use current, sourced freshness evidence so they still
// exercise agreement and sensitive-claim policy independently of the age gate.
export const freshnessEvidence = [{ id: 'freshness', text: '公开官网更新和社媒发布记录' }];
export function freshnessClaims() {
 return ['website_last_update', 'social_last_update'].map(key => ({
  key, value: '公开渠道有更新', sources: ['freshness'], observed_at: new Date().toISOString().slice(0, 10),
 }));
}
