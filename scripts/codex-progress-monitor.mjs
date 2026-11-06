#!/usr/bin/env node
// Codex 夜间进度监控:
//   1) 读取 ~/.codex 下最近活跃的会话 rollout,提取自上次巡检以来的新事件
//   2) 把进度汇总追加到 docs/evidence/codex-progress-<日期>.md
//   3) 用本地 git 做快照提交(回滚点);无变化时安静跳过
// 用法: cd <workspace> && node scripts/codex-progress-monitor.mjs

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, 'docs/evidence');
const STATE_FILE = path.join(EVIDENCE, '.codex-monitor-state.json');
const CODEX_SESSIONS = path.join(os.homedir(), '.codex/sessions');
const HEARTBEAT_MS = 30 * 60 * 1000; // 30 分钟无变化才写心跳
const SESSION_WINDOW_MS = 4 * 60 * 60 * 1000; // 只看近 4 小时的会话文件

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const tz = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const LOG_FILE = path.join(EVIDENCE, `codex-progress-${dateStr}.md`);

function sh(cmd, opts = {}) {
  const { trim = true, ...rest } = opts;
  const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...rest });
  return trim ? out.trim() : out;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { files: {}, lastRun: null, lastEntry: null }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// ---------- git ----------
function ensureGit() {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    sh('git init -q');
    sh('git config user.name "codex-monitor"');
    sh('git config user.email "monitor@local"');
    return 'initialized';
  }
  if (!sh('git config user.name').length) sh('git config user.name "codex-monitor"');
  if (!sh('git config user.email').length) sh('git config user.email "monitor@local"');
  return 'exists';
}

function stageAndCheckSecrets() {
  sh('git add -A');
  const staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
  const bad = staged.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f));
  if (bad.length) {
    sh(`git rm --cached --quiet ${bad.map((f) => JSON.stringify(f)).join(' ')}`)
    return { staged: staged.filter((f) => !bad.includes(f)), warning: `已阻止提交: ${bad.join(', ')}` };
  }
  return { staged, warning: null };
}

// ---------- 会话扫描 ----------
function listRolloutFiles() {
  if (!fs.existsSync(CODEX_SESSIONS)) return [];
  const out = [];
  const cutoff = Date.now() - SESSION_WINDOW_MS;
  for (const ent of fs.readdirSync(CODEX_SESSIONS, { recursive: true, withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (!/^rollout-.*\.jsonl$/.test(ent.name)) continue;
    const abs = path.join(ent.parentPath || ent.path, ent.name);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.mtimeMs >= cutoff || (loadState().files || {})[abs]) out.push({ abs, size: st.size, mtime: st.mtimeMs, name: ent.name });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function threadIdOf(name) {
  const m = name.match(/-(01a[0-9a-f-]+)\.jsonl$/);
  return m ? m[1] : name;
}

// 解析一行 rollout JSON,返回摘要对象或 null
function summarizeLine(line) {
  let d;
  try { d = JSON.parse(line); } catch { return null; }
  const ts = d.timestamp || '';
  const t = d.type || '';
  const p = d.payload || {};
  if (t === 'response_item') {
    if (p.type === 'message') {
      const text = (p.content || []).map((c) => c.text || '').join(' ').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      if (p.role === 'user' && (text.startsWith('<') || text.startsWith('#'))) return null;
      return { kind: 'msg', role: p.role, text: text.slice(0, 220), ts };
    }
    if (p.type === 'custom_tool_call' || p.type === 'function_call') {
      const name = p.name || '';
      const args = String(p.arguments ?? p.input ?? '');
      const files = [...args.matchAll(/(?:Add|Update|Delete) File: ([^\s"'\\]+)/g)]
        .map((m) => m[1].replace(ROOT + '/', ''));
      if (files.length) return { kind: 'patch', files: [...new Set(files)], ts };
      const cmd = (args.match(/cmd:"((?:[^"\\]|\\.)*)"/) || [])[1];
      if (cmd) return { kind: 'cmd', text: cmd.replace(/\\n/g, ' ').replace(/\s+/g, ' ').slice(0, 160), ts };
      if (name) return { kind: 'tool', name, text: args.slice(0, 90), ts };
    }
    return null;
  }
  if (t === 'event_msg') {
    if (p.type === 'task_started') return { kind: 'turnStart', ts };
    if (p.type === 'task_complete') return { kind: 'turnEnd', ts, text: String(p.last_agent_message || '').replace(/\s+/g, ' ').slice(0, 200) };
    if (p.type === 'turn_aborted') return { kind: 'turnAborted', ts, text: String(p.reason || '') };
    if (p.type === 'token_count') {
      const info = p.info || {};
      const lst = info.last_token_usage || info.total_token_usage || {};
      const rl = p.rate_limits || {};
      const pri = rl.primary || {};
      const sec = rl.secondary || {};
      return {
        kind: 'tokens', ts,
        last: lst.total_tokens || 0,
        ctx: info.model_context_window || 0,
        priPct: pri.used_percent, priReset: pri.resets_at,
        secPct: sec.used_percent,
      };
    }
  }
  return null;
}

function readNewEvents(entry, sizeNow) {
  const { abs } = entry;
  const st = fs.statSync(abs);
  const size = st.size;
  let offset = entry.offset ?? size;
  let fresh = false;
  if (entry.offset === undefined || entry.offset === null) {
    // 首次见到该会话:只回看尾部,避免把整晚历史灌进日志
    offset = Math.max(0, size - 120000);
    fresh = true;
  }
  if (size < offset) offset = 0;
  const len = size - offset;
  if (len <= 0) return { events: [], fresh, nextOffset: size };
  const fd = fs.openSync(abs, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, offset);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  const events = text.split('\n').filter(Boolean).map(summarizeLine).filter(Boolean);
  return { events, fresh, nextOffset: size };
}

// ---------- 测试/构建证据 ----------
function evidenceDigest(sinceMs) {
  if (!fs.existsSync(EVIDENCE)) return [];
  const out = [];
  for (const f of fs.readdirSync(EVIDENCE)) {
    if (!f.endsWith('.log')) continue;
    const abs = path.join(EVIDENCE, f);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.mtimeMs < sinceMs) continue;
    let body = '';
    try { body = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const lines = body.split('\n');
    const hits = [];
    for (let i = lines.length - 1; i >= 0 && hits.length < 3; i--) {
      const l = lines[i].trim();
      if (/Test Files\s+\d+\s+(passed|failed)/.test(l) || /Tests\s+\d+\s+(passed|failed)/.test(l) || /Compiled successfully|Failed to compile|error TS\d+/.test(l)) hits.push(l.slice(0, 140));
    }
    if (!hits.length) continue;
    out.push({ file: `docs/evidence/${f}`, hits });
  }
  return out;
}

function turnStatuses() {
  try {
    const out = sh(`sqlite3 "${path.join(os.homedir(), '.codex/thread_history_1.sqlite')}" "SELECT thread_id,status FROM thread_turns ORDER BY started_at DESC LIMIT 12;"`);
    const seen = new Set();
    const rows = [];
    for (const l of out.split('\n').filter(Boolean)) {
      const [thread, status] = l.split('|');
      if (seen.has(thread)) continue;
      seen.add(thread);
      rows.push({ thread, status });
      if (rows.length >= 3) break;
    }
    return rows;
  } catch { return []; }
}

// 近 N 分钟 Codex 侧是否出现用量限额 / 连接失败(用于判断"卡住"的原因)
function recentErrors(minutes = 40) {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - minutes * 60;
    const out = sh(`sqlite3 "${path.join(os.homedir(), '.codex/logs_2.sqlite')}" "SELECT datetime(ts,'unixepoch','+8 hours')||' | '||substr(replace(feedback_log_body,char(10),' '),1,220) FROM logs WHERE ts >= ${cutoff} AND (feedback_log_body LIKE '%usage limit%' OR feedback_log_body LIKE '%Connection refused%' OR feedback_log_body LIKE '%request_timeout%') ORDER BY ts DESC LIMIT 2;"`);
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

const LATEST_FILE = path.join(EVIDENCE, 'codex-progress-latest.md');

function writeLatest({ commitHash, statuses, inProgress, stallMin, tokenInfos }) {
  const t = tokenInfos[tokenInfos.length - 1];
  const pct = t && t.ctx ? Math.round((t.last / t.ctx) * 100) : null;
  const lines = [
    '# Codex 进度 · 最新状态',
    '',
    `> 刷新时间: ${dateStr} ${tz(now)} · 详细过程见 \`docs/evidence/codex-progress-${dateStr}.md\` · 生成本文件: \`scripts/codex-progress-monitor.mjs\``,
    '',
    `- **主会话 turn 状态**: ${statuses.length ? statuses.map((s) => `${s.thread.slice(0, 8)}=${s.status}`).join(', ') : '未知'}`,
    `- **上下文占用**: ${t ? `${t.last.toLocaleString()}${pct !== null ? ` / ${t.ctx.toLocaleString()} (${pct}%)` : ''}` : '本周期无新 token 数据'}`,
    `- **用量限额**: ${t && t.priPct !== undefined ? `5 小时窗口 ${t.priPct}% · 7 天窗口 ${t.secPct ?? '?'}%` : '本周期无新限额数据'}`,
    `- **运行状态**: ${inProgress ? (stallMin > 20 ? `⚠️ 已 ${stallMin} 分钟无新事件且 turn 仍进行中 —— 很可能停在等待审批/确认` : `进行中(最近 ${stallMin} 分钟内有活动)`) : '当前无进行中的 turn'}`,
    `- **最近快照提交**: ${commitHash ? `\`${commitHash}\`` : '本周期无新提交(无变化)'}`,
    commitHash ? `- **回滚到本次快照**: \`git reset --hard ${commitHash}\`` : '',
    `- **回滚到更早快照**: \`git log --oneline\` 选一个 ` + '`git reset --hard <hash>`。',
    '',
  ].filter((l) => l !== '');
  fs.writeFileSync(LATEST_FILE, lines.join('\n') + '\n');
}

// ---------- 组装日志条目 ----------
function appendLog(lines) {
  const header = `# Codex 夜间进度监控 · ${dateStr}

> 回滚方法: \`git log --oneline\` 查看快照提交 → \`git reset --hard <hash>\` 回到该时间点(或用 \`git checkout <hash> -- <file>\` 只回滚单个文件)。
> 生成本文件的脚本: \`scripts/codex-progress-monitor.mjs\`;每次巡检追加一节,并同时产生一个 git 提交。

`;
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, header);
  fs.appendFileSync(LOG_FILE, lines.join('\n') + '\n\n');
}

function main() {
  const gitMode = ensureGit();
  const state = loadState();
  const since = state.lastRun ? Date.parse(state.lastRun) : Date.now() - SESSION_WINDOW_MS;

  const files = listRolloutFiles();
  const perThread = new Map();
  let totalNew = 0;
  const tokenInfos = [];

  for (const f of files) {
    const tid = threadIdOf(f.name);
    const entry = (state.files && state.files[f.abs]) || { offset: null };
    let res;
    try { res = readNewEvents({ ...f, offset: entry.offset }, f.size); } catch { continue; }
    state.files[f.abs] = { offset: res.nextOffset, name: f.name };
    if (!res.events.length) continue;
    totalNew += res.events.length;
    if (!perThread.has(tid)) perThread.set(tid, { fresh: res.fresh, events: [], name: f.name, mtime: f.mtime });
    perThread.get(tid).events.push(...res.events);
    if (res.fresh) perThread.get(tid).fresh = true;
    for (const e of res.events) if (e.kind === 'tokens') tokenInfos.push(e);
  }

  const staleSessions = Object.keys(state.files || {}).filter((abs) => !files.some((f) => f.abs === abs) || (fs.existsSync(abs) && Date.now() - fs.statSync(abs).mtimeMs > SESSION_WINDOW_MS));
  // 保留 12 小时内的会话偏移记录,清理更老的
  const keep = {};
  for (const [abs, v] of Object.entries(state.files || {})) {
    try { if (Date.now() - fs.statSync(abs).mtimeMs < 12 * 3600 * 1000) keep[abs] = v; } catch { /* 文件可能被删 */ }
  }
  state.files = keep;

  // 工作区变更(相对上次提交)
  let porcelain = [];
  try { porcelain = sh('git status --porcelain', { trim: false }).split('\n').filter(Boolean); } catch { /* ignore */ }
  const changed = porcelain.map((l) => l.slice(3).trim()).filter(Boolean);
  const changedCode = changed.filter((f) => !/^docs\/evidence\//.test(f) && !f.startsWith('.codex-monitor-state'));

  const digest = evidenceDigest(since);
  const statuses = turnStatuses();
  const latestActivity = files.length ? Math.max(...files.map((f) => f.mtime)) : 0;
  const stallMin = latestActivity ? Math.round((Date.now() - latestActivity) / 60000) : 999;
  const inProgress = statuses.some((s) => /inProgress|in_progress/i.test(s.status));
  const hasActivity = totalNew > 0 || changedCode.length > 0 || digest.length > 0;
  const lastEntryMs = state.lastEntry ? Date.parse(state.lastEntry) : 0;

  if (!hasActivity && Date.now() - lastEntryMs < HEARTBEAT_MS) {
    state.lastRun = now.toISOString();
    saveState(state);
    console.log('无新活动,跳过写入。');
    return;
  }

  const L = [];
  L.push(`## ${tz(now)} 巡检`);
  let sessionLine = [];
  for (const [tid, v] of perThread) {
    const evs = v.events;
    const started = evs.filter((e) => e.kind === 'turnStart').length;
    const ended = evs.filter((e) => e.kind === 'turnEnd').length;
    const aborted = evs.filter((e) => e.kind === 'turnAborted').length;
    const tag = v.fresh ? '(新会话,仅回看尾部)' : '';
    sessionLine.push(`\`${tid.slice(0, 8)}\`${tag} 新事件 ${evs.length} 条:turn开始 ${started}/完成 ${ended}/中断 ${aborted}`);
  }
  L.push(`- **会话**: ${sessionLine.length ? sessionLine.join(';') : '无新会话事件'}`);
  if (statuses.length) L.push(`- **turn 状态**: ${statuses.map((s) => `${s.thread.slice(0, 8)}=${s.status}`).join(', ')}`);

  if (inProgress && stallMin > 20) L.push(`- **⚠️ 疑似停滞**: 主会话已 ${stallMin} 分钟无新事件但 turn 仍进行中 —— 很可能停在等待审批/确认,Codex 不会自行继续,需要你回来点同意。`);
  const recentErrs = recentErrors();
  if (recentErrs.length) L.push(`- **⚠️ 近期 Codex 报错**:\n${recentErrs.map((q) => `  - \`${q.replace(/`/g, "'")}\``).join('\n')}`);

  if (tokenInfos.length) {
    const t = tokenInfos[tokenInfos.length - 1];
    const pct = t.ctx ? Math.round((t.last / t.ctx) * 100) : null;
    L.push(`- **上下文占用(最近一次请求)**: ${t.last.toLocaleString()}${pct !== null ? ` / ${t.ctx.toLocaleString()} (${pct}%)` : ''}${pct !== null && pct >= 90 ? ' ⚠️ 接近压缩阈值' : ''}`);
    if (t.priPct !== undefined || t.secPct !== undefined) {
      const reset = t.priReset ? new Date(t.priReset * 1000) : null;
      L.push(`- **用量限额**: 5 小时窗口 ${t.priPct ?? '?'}%${reset ? `(重置于 ${pad(reset.getHours())}:${pad(reset.getMinutes())})` : ''} · 7 天窗口 ${t.secPct ?? '?'}%`);
    }
  }

  const cmds = [...new Set([...perThread.values()].flatMap((v) => v.events.filter((e) => e.kind === 'cmd').map((e) => e.text)))].slice(0, 10);
  if (cmds.length) L.push(`- **Codex 执行的命令**:\n${cmds.map((c) => `  - \`${c}\``).join('\n')}`);

  const patches = [...new Set([...perThread.values()].flatMap((v) => v.events.filter((e) => e.kind === 'patch').flatMap((e) => e.files)))].slice(0, 15);
  if (patches.length) L.push(`- **Codex 修改的文件**: ${patches.map((f) => `\`${f}\``).join(', ')}`);

  const msgs = [...perThread.values()].flatMap((v) => v.events.filter((e) => e.kind === 'msg'));
  const userMsgs = msgs.filter((m) => m.role === 'user').slice(-3);
  const aiMsgs = msgs.filter((m) => m.role === 'assistant').slice(-3);
  if (userMsgs.length) L.push(`- **用户消息**: ${userMsgs.map((m) => `"${m.text}"`).join(' ')}`);
  if (aiMsgs.length) L.push(`- **Codex 最新回复**: ${aiMsgs.map((m) => `"${m.text}"`).join(' ')}`);
  const ends = [...perThread.values()].flatMap((v) => v.events.filter((e) => e.kind === 'turnEnd')).slice(-2);
  if (ends.length) L.push(`- **完成回合收尾**: ${ends.map((e) => `"${e.text}"`).join(' ')}`);

  if (changed.length) {
    const shown = changed.slice(0, 20);
    L.push(`- **本次巡检前的工作区变更**: ${changed.length} 个文件${changed.length > 20 ? `(仅列前 20)` : ''}\n${shown.map((f) => `  - \`${f}\``).join('\n')}`);
  } else {
    L.push('- **工作区变更**: 无(与上次快照一致)');
  }

  if (digest.length) {
    L.push(`- **测试/构建证据变化**:\n${digest.map((d) => `  - \`${d.file}\`: ${d.hits.join(' | ')}`).join('\n')}`);
  }

  // 日志条目先落盘,再连同工作区一起提交,保证每次快照都能追溯到对应巡检记录
  L.push('- **快照**: 本次巡检的工作区与日志已一并提交到本地 git(提交信息含巡检时间)');
  appendLog(L);

  state.lastRun = now.toISOString();
  state.lastEntry = now.toISOString();
  if (state.gitMode !== gitMode) state.gitMode = gitMode;
  saveState(state);

  let commitHash = null;
  try {
    const { staged, warning } = stageAndCheckSecrets();
    if (staged.length) {
      sh(`git commit -q -m "巡检 ${dateStr} ${tz(now)} · 代码变更 ${changedCode.length} 文件"`);
      commitHash = sh('git log -1 --format=%h');
      if (warning) console.log(`⚠️ ${warning}`);
    }
  } catch (e) {
    console.log(`⚠️ 快照提交失败: ${String(e.message).slice(0, 200)}`);
  }

  writeLatest({ commitHash, statuses, inProgress, stallMin, tokenInfos });

  console.log(`[${tz(now)}] 巡检完成: 新事件 ${totalNew} 条, 变更文件 ${changed.length} 个, 快照 ${commitHash || '无(无变化)'}`);
  if (L.length > 2) console.log(L.join('\n'));
}

main();
