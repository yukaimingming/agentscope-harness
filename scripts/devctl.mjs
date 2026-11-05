#!/usr/bin/env node
/**
 * devctl.mjs — AgentScope Harness 开发自动化工具（零依赖，纯 Node 内置模块）
 *
 * 用法：
 *   node scripts/devctl.mjs <command> [options]
 *
 * 命令：
 *   env      校验开发环境（JDK 21+ / Node 20.11+ / pnpm / 后端 jar）
 *   build    构建后端 Maven 产物与前端依赖
 *   start    启动后端 + 前端（健康轮询，替代固定 sleep）
 *   stop     停止已启动的服务（按 PID 文件，兜底按端口）
 *   status   查看后端 / 前端服务运行状态
 *   test     冒烟测试：后端 /api/health + 前端端口连通性
 *
 * 选项：
 *   --only=backend|frontend   仅操作指定端
 *   --timeout=<秒>            健康检查超时时间（默认 60）
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// 路径与配置常量
// ----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';

const CONFIG = {
  backend: {
    name: 'backend',
    port: 8787,
    baseDir: path.join(PROJECT_ROOT, 'backend'),
    jar: path.join(PROJECT_ROOT, 'backend', 'target', 'agentscope-harness-spring-1.0.0.jar'),
    healthPath: '/api/health',
    javaOpts: ['-Dfile.encoding=UTF-8', '-jar'],
  },
  frontend: {
    name: 'frontend',
    port: 5174,
    baseDir: path.join(PROJECT_ROOT, 'frontend'),
    devArgs: ['--filter', '@deepagent/web', 'dev', '--host', '127.0.0.1', '--port', '5174'],
  },
  runDir: path.join(PROJECT_ROOT, '.devctl'),
  healthTimeoutMs: 60_000,
  pollIntervalMs: 1_000,
  toolRequirements: {
    java: { minMajor: 21, label: 'JDK' },
    node: { minVersion: '20.11.0', label: 'Node.js' },
  },
};

// ----------------------------------------------------------------------------
// 公共工具：彩色日志
// ----------------------------------------------------------------------------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function stamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

const log = {
  raw: (s = '') => console.log(s),
  info: (s) => console.log(`${C.cyan}[${stamp()}]${C.reset} ${s}`),
  ok: (s) => console.log(`${C.green}[${stamp()}] ✓ ${s}${C.reset}`),
  warn: (s) => console.log(`${C.yellow}[${stamp()}] ! ${s}${C.reset}`),
  fail: (s) => console.error(`${C.red}[${stamp()}] ✗ ${s}${C.reset}`),
  step: (n, total, s) => console.log(`${C.blue}[${stamp()}] [${n}/${total}] ${s}${C.reset}`),
  dim: (s) => console.log(`${C.gray}  ${s}${C.reset}`),
  header: (s) => console.log(`\n${C.bold}${C.blue}${'='.repeat(56)}\n  ${s}\n${'='.repeat(56)}${C.reset}`),
};

// ----------------------------------------------------------------------------
// 公共工具：子进程封装
// ----------------------------------------------------------------------------
function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || PROJECT_ROOT,
    encoding: 'utf8',
    shell: IS_WIN ? 'cmd /c' : false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

/**
 * 后台启动一个常驻进程（detached），继承父进程 stdio 以便在终端查看日志。
 * 返回子进程 PID。
 */
function runDetached(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || PROJECT_ROOT,
    detached: true,
    shell: IS_WIN,
    windowsHide: false,
    stdio: 'ignore',
  });
  child.on('error', (e) => log.fail(`启动 ${cmd} 失败: ${e.message}`));
  return child.pid;
}

// ----------------------------------------------------------------------------
// 公共工具：HTTP / 端口探测
// ----------------------------------------------------------------------------
/**
 * 发起一次 HTTP GET，返回 { ok, status, body, error }。
 */
function httpGet(url, { timeoutMs = 5_000 } = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
  });
}

/**
 * 探测 TCP 端口是否被监听（不做 HTTP 握手，仅建连）。
 */
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const done = (v) => { socket.destroy(); resolve(v); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 1_500);
  });
}

/**
 * 轮询等待健康检查通过（替代固定 sleep）。onTick 用于进度回调。
 */
async function waitForHealth(url, { timeoutMs = CONFIG.healthTimeoutMs, intervalMs = CONFIG.pollIntervalMs, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const res = await httpGet(url, { timeoutMs: 3_000 });
    if (res.ok) return { ok: true, attempt, body: res.body, status: res.status };
    if (onTick) onTick(attempt, res.error || res.status);
    await sleep(intervalMs);
  }
  return { ok: false, attempt };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// 公共工具：PID 文件管理
// ----------------------------------------------------------------------------
function pidFile(name) {
  return path.join(CONFIG.runDir, `${name}.pid`);
}

function savePid(name, pid) {
  fs.mkdirSync(CONFIG.runDir, { recursive: true });
  fs.writeFileSync(pidFile(name), String(pid), 'utf8');
}

function loadPid(name) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile(name), 'utf8').trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function clearPid(name) {
  try { fs.rmSync(pidFile(name), { force: true }); } catch { /* 忽略 */ }
}

/** 判断 PID 对应进程是否存活（跨平台） */
function pidAlive(pid) {
  if (!pid) return false;
  const r = run(IS_WIN ? 'tasklist' : 'ps', IS_WIN ? ['/FI', `PID eq ${pid}`, '/NH'] : ['-p', String(pid)]);
  if (IS_WIN) return r.stdout.includes(String(pid));
  return r.ok && r.stdout.trim().length > 0;
}

/** 终止 PID 对应进程 */
function killPid(pid) {
  const r = run(IS_WIN ? 'taskkill' : 'kill', IS_WIN ? ['/F', '/PID', String(pid)] : ['-9', String(pid)]);
  return r.ok;
}

// ----------------------------------------------------------------------------
// 版本号解析工具
// ----------------------------------------------------------------------------
/** 从 'v24.22.1' / '21.0.12.1' 形式解析主版本号 */
function majorVersion(v) {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 语义化版本比较：v1 >= v2 返回 true */
function versionGte(v1, v2) {
  const parse = (v) => String(v).trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(v1), b = parse(v2);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

/** Windows 控制台默认 GBK，切到 UTF-8 以正确显示中文（与 run.cmd 一致） */
function ensureUtf8Console() {
  if (IS_WIN) {
    try {
      spawnSync('chcp', ['65001'], { shell: 'cmd /c', stdio: 'ignore', windowsHide: true });
    } catch { /* 忽略：无碍主流程 */ }
  }
}

// ----------------------------------------------------------------------------
// CLI 入口与命令分发
// ----------------------------------------------------------------------------
const COMMANDS = ['env', 'build', 'start', 'stop', 'status', 'test'];

// 解析全局选项
const args = process.argv.slice(2);
const opts = { only: null, healthTimeout: 60 };
const positional = [];
for (const a of args) {
  if (a.startsWith('--only=')) {
    opts.only = a.slice('--only='.length);
  } else if (a.startsWith('--timeout=')) {
    opts.healthTimeout = parseInt(a.slice('--timeout='.length), 10) || 60;
  } else if (!a.startsWith('-')) {
    positional.push(a);
  }
}
CONFIG.healthTimeoutMs = opts.healthTimeout * 1000;

function usage() {
  log.header('devctl — AgentScope Harness 开发自动化工具');
  log.raw(`${C.bold}用法:${C.reset} node scripts/devctl.mjs <command> [options]\n`);
  log.raw(`${C.bold}命令:${C.reset}`);
  log.raw('  env      校验开发环境（JDK 21+ / Node 20.11+ / pnpm / 后端 jar）');
  log.raw('  build    构建后端 Maven 产物与前端依赖');
  log.raw('  start    启动后端 + 前端（健康轮询，替代固定 sleep）');
  log.raw('  stop     停止已启动的服务（按 PID 文件，兜底按端口）');
  log.raw('  status   查看后端 / 前端服务运行状态');
  log.raw('  test     冒烟测试：后端 /api/health + 前端端口连通性\n');
  log.raw(`${C.bold}选项:${C.reset}`);
  log.raw('  --only=backend|frontend   仅操作指定端');
  log.raw('  --timeout=<秒>            健康检查超时时间（默认 60）');
}

/**
 * Maven 探测：PATH 优先，回退到 run.cmd 中的备用路径。
 */
function resolveMaven() {
  const r = run('mvn', ['-v']);
  if (r.ok && r.stdout.includes('Apache Maven')) {
    const v = r.stdout.split('\n')[0].match(/Apache Maven\s+([\d.]+)/);
    return { found: true, cmd: 'mvn', version: v ? v[1] : null, source: 'PATH' };
  }
  const fallback = path.join('D:', 'temp', '.tools', 'apache-maven-3.9.11', 'bin', 'mvn.cmd');
  if (fs.existsSync(fallback)) {
    const r2 = run('cmd', ['/c', fallback, '-v']);
    if (r2.ok && r2.stdout.includes('Apache Maven')) {
      const v = r2.stdout.split('\n')[0].match(/Apache Maven\s+([\d.]+)/);
      return { found: true, cmd: fallback, version: v ? v[1] : null, source: '备用路径' };
    }
  }
  return { found: false, cmd: null, version: null, source: null };
}

/** 校验工具版本，返回 { ok, current, required, label, detail } */
function checkTool(label, runner, required) {
  const r = runner();
  if (!r.ok || !r.version) {
    return { ok: false, label, required, current: null, detail: r.detail || '未找到或无法执行' };
  }
  if (required.minMajor) {
    const major = majorVersion(r.version);
    const ok = major !== null && major >= required.minMajor;
    return { ok, label, required: `>= ${required.minMajor}`, current: r.version, detail: ok ? '' : `主版本需 >= ${required.minMajor}` };
  }
  const ok = versionGte(r.version, required.minVersion);
  return { ok, label, required: `>= ${required.minVersion}`, current: r.version, detail: ok ? '' : `版本需 >= ${required.minVersion}` };
}

// 命令实现（后续任务逐个填充）
async function cmdEnv() {
  log.header('环境检查 · env');
  const steps = 5;
  let allOk = true;
  const report = {};

  // 1) JDK —— 要求 21+（Spring Boot 3.4.3 最低要求 17， AgentScope Java 建议 21）
  log.step(1, steps, '检查 JDK（java 21+）');
  const javaRes = checkTool('JDK', () => {
    const r = run('java', ['-version']);
    return { ok: r.ok, version: r.stderr ? r.stderr.split('\n')[0].replace(/openjdk version|java version/i, '').replace(/"/g, '').trim() : null, detail: r.stderr };
  }, CONFIG.toolRequirements.java);
  report.java = javaRes;
  javaRes.ok ? log.ok(`JDK ${javaRes.current}`) : (allOk = false, log.fail(`JDK ${javaRes.detail}`));

  // 2) Maven —— 可选（jar 已存在时不阻断）
  log.step(2, steps, '检查 Maven（可选）');
  const mvnRes = resolveMaven();
  report.maven = mvnRes;
  if (mvnRes.found) {
    log.ok(`Maven ${mvnRes.version}（来源：${mvnRes.source}）`);
  } else {
    log.warn('Maven 未找到（PATH 均不可用）。jar 包已存在时构建不受影响；需要重新打包时请安装 Maven。');
  }

  // 3) Node.js —— 要求 20.11+
  log.step(3, steps, '检查 Node.js（20.11+）');
  const nodeRes = checkTool('Node.js', () => {
    const r = run('node', ['--version']);
    return { ok: r.ok, version: r.stdout || null, detail: r.stderr };
  }, CONFIG.toolRequirements.node);
  report.node = nodeRes;
  nodeRes.ok ? log.ok(`Node.js ${nodeRes.current}`) : (allOk = false, log.fail(`Node.js ${nodeRes.detail}`));

  // 4) pnpm —— 要求存在（无硬版本下限）
  log.step(4, steps, '检查 pnpm');
  const pnpmRes = checkTool('pnpm', () => {
    const r = run('pnpm', ['--version']);
    return { ok: r.ok, version: r.stdout || null, detail: r.stderr };
  }, { minVersion: '9.0.0' });
  report.pnpm = pnpmRes;
  if (pnpmRes.ok) {
    log.ok(`pnpm ${pnpmRes.current}`);
  } else {
    log.warn(`pnpm ${pnpmRes.detail || '未找到'}（>= 9.0.0）`);
  }

  // 5) 后端 jar 产物
  log.step(5, steps, '检查后端 jar 产物');
  const jarExists = fs.existsSync(CONFIG.backend.jar);
  report.jar = { exists: jarExists, path: CONFIG.backend.jar };
  jarExists ? log.ok(path.relative(PROJECT_ROOT, CONFIG.backend.jar)) : (allOk = false, log.fail(`未找到后端 jar：${CONFIG.backend.jar}（请执行 build 或 run.cmd）`));

  // 汇总
  log.raw('');
  const hard = [report.java, report.node, report.jar];
  const hardOk = hard.filter((x) => x.ok !== false && x.exists !== false).length;
  if (hardOk === hard.length) {
    log.ok(`环境就绪（必需项全部通过${report.maven.found ? '；Maven 可用' : '；Maven 缺失但不影响启动'}）`);
    process.exitCode = 0;
  } else {
    log.fail('环境检查未通过：请修复上述 ✗ 项后再启动');
    process.exitCode = 1;
  }
  return report;
}

async function cmdBuild() {
  log.fail('build 命令尚未实现（TODO: 任务5）');
  process.exitCode = 2;
}

async function cmdStart() {
  log.fail('start 命令尚未实现（TODO: 任务6）');
  process.exitCode = 2;
}

async function cmdStop() {
  log.fail('stop 命令尚未实现（TODO: 任务6）');
  process.exitCode = 2;
}

async function cmdStatus() {
  log.fail('status 命令尚未实现（TODO: 任务6）');
  process.exitCode = 2;
}

async function cmdTest() {
  log.fail('test 命令尚未实现（TODO: 任务7）');
  process.exitCode = 2;
}

const DISPATCH = {
  env: cmdEnv, build: cmdBuild, start: cmdStart, stop: cmdStop, status: cmdStatus, test: cmdTest,
};

// ----------------------------------------------------------------------------
// 主流程
// ----------------------------------------------------------------------------
(function main() {
  ensureUtf8Console();
  const command = positional[0];
  if (!command || !DISPATCH[command]) {
    if (command) log.fail(`未知命令: ${command}`);
    usage();
    process.exitCode = 1;
    return;
  }
  if (opts.only && !['backend', 'frontend'].includes(opts.only)) {
    log.fail(`--only 取值非法: ${opts.only}（应为 backend 或 frontend）`);
    process.exitCode = 1;
    return;
  }
  DISPATCH[command]().catch((e) => {
    log.fail(`命令执行异常: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
})();
