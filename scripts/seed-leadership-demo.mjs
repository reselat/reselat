#!/usr/bin/env node
/**
 * 本机领导演示：经 127.0.0.1:3120 API 预置一条获客链（线索→背调→草稿→待审）。
 * 仅本机 local-test；不读生产密钥；默认不发信。可重复执行（按邮箱幂等合并线索）。
 */
import {randomUUID} from 'node:crypto';

const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3120';
const email = (process.env.DEMO_LEAD_EMAIL || 'demo-lead+siliantai@example.test').toLowerCase();
const companyName = process.env.DEMO_LEAD_NAME || 'Nordic Harbor Trading Demo AB';

function uuid() {
  return randomUUID();
}

async function login() {
  const res = await fetch(`${origin}/api/local-test/session`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin,
    },
    body: 'role=admin',
  });
  if (res.status !== 303 && res.status !== 302) {
    const text = await res.text();
    throw new Error(`login failed status=${res.status} body=${text.slice(0, 200)}`);
  }
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookieHeader = (raw.length ? raw : [res.headers.get('set-cookie')].filter(Boolean))
    .map((c) => String(c).split(';')[0])
    .join('; ');
  if (!cookieHeader.includes('reselat-local-role=')) {
    throw new Error('login missing reselat-local-role cookie');
  }
  return cookieHeader;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      cookie,
      origin,
      ...(body ? {'content-type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function postAction(cookie, action, input) {
  return api(cookie, 'POST', '/api/workspace/business', {action, input});
}

async function main() {
  console.log(`目标 ${origin}`);
  const cookie = await login();
  console.log('已登录本机测试管理员（无密码）');

  const lead = await postAction(cookie, 'leads_upsert', {
    requestId: uuid(),
    payload: {
      name: companyName,
      email,
      source: 'maps',
      placeId: 'demo-place-nordic-harbor',
      mapsUrl: 'https://maps.google.com/?q=Nordic+Harbor+Trading+Demo',
      notes: '领导演示虚构线索 · Maps 导入样例 · 勿对真实客户发送',
      address: 'Demo quay 12, Gothenburg, Sweden',
      phone: '+46-31-000-0000',
    },
  });
  console.log('线索', lead.id, email);

  const summary = [
    '【领导演示·虚构背调】Nordic Harbor Trading Demo AB（瑞典进口商样例）。',
    '公开活跃度：官网与 LinkedIn 近 90 日内有更新（演示口径：活跃）；行业社媒近 180 日有发布。',
    '未知项：实控人背景、年采购额、付款习惯——标记「未知，待人工核查」，不编造。',
    '风险提示：邮箱为测试地址，演示结束前勿配置 Brevo 真发到此地址以外的真实客户。',
    '建议话术：强调 Agent 不能自批、回写 ≠ 已发信、人点发经 Brevo。',
  ].join('\n');

  const report = await postAction(cookie, 'diligence_save_report', {
    requestId: uuid(),
    payload: {leadId: lead.id, summary},
  });
  console.log('背调', report.id);

  const subject = 'Introduction: Reliable sourcing partner for Nordic Harbor (demo)';
  const body = [
    `Dear purchasing team at ${companyName},`,
    '',
    'This is a local demo outreach draft for Siliantai / RESELAT leadership review.',
    'We help mid-size Nordic importers consolidate OEM supply with clear QC and shipment milestones.',
    '',
    'Key points from diligence (demo):',
    '- Public channels look active within 90 days',
    '- Ownership and spend remain unknown pending human check',
    '',
    'No real send until an admin clicks「经 Brevo 发送」after approval.',
    '',
    'Best regards,',
    'RESELAT local-test outreach',
  ].join('\n');

  const draft = await postAction(cookie, 'outreach_draft_email', {
    requestId: uuid(),
    payload: {leadId: lead.id, subject, body},
  });
  console.log('草稿', draft.id);

  const approval = await postAction(cookie, 'outreach_submit_approval', {
    requestId: uuid(),
    payload: {draftId: draft.id},
  });
  console.log('审批队列(pending)', approval.id);

  const queue = await api(cookie, 'GET', '/api/workspace/business?view=approval-queue&state=pending');
  const match = (queue.items || []).find((q) => q.id === approval.id || q.draft_id === draft.id);
  console.log('核对 pending 条数', (queue.items || []).length, '本条', match ? '在列' : '未找到(可能重复提交后已存在)');

  console.log('\n演示入口:');
  console.log(`  ${origin}/login  → 选「测试管理员」`);
  console.log(`  ${origin}/workspace/prospecting`);
  console.log('从「人工审批」队列点批准 →（可选）回写 →（可选）经 Brevo 发送');
  console.log(JSON.stringify({leadId: lead.id, reportId: report.id, draftId: draft.id, approvalId: approval.id, email}, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
