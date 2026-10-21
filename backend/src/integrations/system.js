import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { resolveInside, httpError } from '../security/paths.js';

const run = promisify(execFile);
const isWin = process.platform === 'win32';
const PS = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, windowsHide: true, maxBuffer: 8e6 });

async function cpuUsage() {
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = snap(); await new Promise((r) => setTimeout(r, 400)); const b = snap();
  const dt = b.total - a.total; return dt > 0 ? Math.round((1 - (b.idle - a.idle) / dt) * 1000) / 10 : null;
}
async function disks() {
  try {
    if (isWin) {
      const { stdout } = await PS('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress');
      const j = JSON.parse(stdout || '[]'); return [].concat(j).map((d) => ({ drive: d.DeviceID, totalBytes: +d.Size, freeBytes: +d.FreeSpace, usedPct: Math.round((1 - d.FreeSpace / d.Size) * 1000) / 10 }));
    }
    const { stdout } = await run('df', ['-kP', '-x', 'tmpfs', '-x', 'devtmpfs'], { timeout: 8000 });
    return stdout.trim().split('\n').slice(1).map((l) => l.split(/\s+/)).filter((c) => c[0].startsWith('/')).map((c) => ({ drive: c[5], totalBytes: +c[1] * 1024, freeBytes: +c[3] * 1024, usedPct: parseFloat(c[4]) }));
  } catch { return null; }
}

let cachedBattery = null;
let lastBatteryAt = 0;

export async function getBattery() {
  try {
    if (isWin) {
      const { stdout: batOut } = await PS('Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object EstimatedChargeRemaining,BatteryStatus,Status | ConvertTo-Json -Compress');
      if (!batOut?.trim()) return null;
      const b = JSON.parse(batOut);
      const states = { 1: 'Discharging', 2: 'AC Connected / Charging', 3: 'Fully Charged', 4: 'Low', 5: 'Critical', 6: 'Charging', 7: 'Charging & High', 8: 'Charging & Low', 9: 'Charging & Critical', 10: 'Undefined', 11: 'Partially Charged' };

      const now = Date.now();
      if (!cachedBattery || (now - lastBatteryAt > 60000)) {
        try {
          const tmpPath = path.join(os.tmpdir(), `bat_${Date.now()}.xml`);
          await run('powercfg', ['/batteryreport', '/xml', '/output', tmpPath], { timeout: 8000, windowsHide: true });
          if (fs.existsSync(tmpPath)) {
            const xml = await fs.promises.readFile(tmpPath, 'utf8');
            await fs.promises.unlink(tmpPath).catch(() => {});
            const designMatch = xml.match(/<DesignCapacity>(\d+)<\/DesignCapacity>/);
            const fullMatch = xml.match(/<FullChargeCapacity>(\d+)<\/FullChargeCapacity>/);
            const cycleMatch = xml.match(/<CycleCount>(\d+)<\/CycleCount>/);
            if (designMatch && fullMatch) {
              const design = +designMatch[1];
              const full = +fullMatch[1];
              cachedBattery = {
                designCapacityMWh: design,
                fullChargeCapacityMWh: full,
                healthPct: design > 0 ? Math.round((full / design) * 1000) / 10 : null,
                cycleCount: cycleMatch ? +cycleMatch[1] : 0,
              };
              lastBatteryAt = now;
            }
          }
        } catch {
          // If powercfg XML is not permitted, still return live battery charge
        }
      }

      const healthPct = cachedBattery?.healthPct ?? null;
      const degradationPct = healthPct != null ? Math.round((100 - healthPct) * 10) / 10 : null;
      let condition = 'Good';
      let warning = null;
      let measures = [];

      if (healthPct != null) {
        if (healthPct < 50) {
          condition = 'Very Poor (Critical Degradation)';
          warning = `CRITICAL WARNING: Battery has degraded by ${degradationPct}% (only ${healthPct}% capacity remaining). It holds less than half its factory charge, resulting in severely shortened runtime and risk of sudden shutdowns under load.`;
          measures = [
            'Hardware Replacement: Replace the internal battery pack soon, as it has degraded past the 50% wear threshold.',
            'Avoid Deep Discharges: Do not let the battery drain below 20% to avoid sudden power-offs and cell instability.',
            'Enable Battery Conservation / Threshold: If plugged in often, use manufacturer software (e.g. Acer Care Center) to cap charge at 80% to reduce heat stress.',
            'Keep Plugged In for Intensive Work: Always keep the AC adapter plugged in during heavy CPU/GPU tasks (gaming, compiling, AI models).'
          ];
        } else if (healthPct < 75) {
          condition = 'Degraded';
          warning = `Warning: Battery has degraded by ${degradationPct}% (${healthPct}% capacity remaining). Backup time is noticeably reduced.`;
          measures = [
            'Use Windows Power Efficiency mode when on battery.',
            'Avoid keeping laptop in hot environments.'
          ];
        }
      }

      return {
        hasBattery: true,
        chargePct: b.EstimatedChargeRemaining,
        powerState: states[b.BatteryStatus] || b.Status || 'OK',
        healthPct,
        degradationPct,
        condition,
        warning,
        suggestedMeasures: measures,
        designCapacityMWh: cachedBattery?.designCapacityMWh ?? null,
        fullChargeCapacityMWh: cachedBattery?.fullChargeCapacityMWh ?? null,
        cycleCount: cachedBattery?.cycleCount ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getHealth() {
  const total = os.totalmem(), free = os.freemem();
  return {
    platform: `${os.type()} ${os.release()}`, host: os.hostname(), uptimeHours: Math.round(os.uptime() / 360) / 10,
    cpu: { cores: os.cpus().length, model: os.cpus()[0]?.model ?? 'unknown', usagePct: await cpuUsage(), loadAvg: isWin ? null : os.loadavg() },
    memory: { totalBytes: total, freeBytes: free, usedPct: Math.round((1 - free / total) * 1000) / 10 },
    disks: await disks(),
    battery: await getBattery(),
    collectedAt: new Date().toISOString(),
  };
}
export async function listProcesses({ sortBy = 'memory', limit = 10 } = {}) {
  try {
    let rows;
    if (isWin) {
      const { stdout } = await PS('Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress');
      rows = [].concat(JSON.parse(stdout || '[]')).map((p) => ({ pid: p.Id, name: p.ProcessName, cpuSeconds: p.CPU ? Math.round(p.CPU * 10) / 10 : 0, memoryBytes: p.WorkingSet64 }));
    } else {
      const { stdout } = await run('ps', ['-eo', 'pid=,comm=,pcpu=,rss='], { timeout: 8000 });
      rows = stdout.trim().split('\n').map((l) => { const m = l.trim().match(/^(\d+)\s+(.+?)\s+([\d.]+)\s+(\d+)$/); return m && { pid: +m[1], name: m[2], cpuPct: +m[3], memoryBytes: +m[4] * 1024 }; }).filter(Boolean);
    }
    rows.sort((a, b) => sortBy === 'cpu' ? (b.cpuPct ?? b.cpuSeconds ?? 0) - (a.cpuPct ?? a.cpuSeconds ?? 0) : b.memoryBytes - a.memoryBytes);
    return { count: rows.length, top: rows.slice(0, Math.min(limit, 50)) };
  } catch { return null; }
}
export async function findLargeFiles({ dir, minMB = 100, limit = 25, maxScan = 200000 }) {
  const root = resolveInside(dir, config.approvedDirs);
  const found = []; let scanned = 0; let truncated = false;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    let entries; try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (++scanned > maxScan) { truncated = true; stack.length = 0; break; }
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { try { const s = await fs.promises.stat(p); if (s.size >= minMB * 1048576) found.push({ path: p, sizeBytes: s.size, modified: s.mtime.toISOString() }); } catch { /* skip */ } }
    }
  }
  found.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return { root, scanned, truncated, files: found.slice(0, limit) };
}
export function recommendations(health, procs) {
  const r = [];
  if (!health) return [{ level: 'info', text: 'No metrics available, so no recommendations can be made.' }];
  if (health.memory.usedPct >= 85) r.push({ level: 'warn', text: `Memory is ${health.memory.usedPct}% used. Close heavy apps or browser tabs, or restart long-running programs.` });
  if (health.cpu.usagePct != null && health.cpu.usagePct >= 80) r.push({ level: 'warn', text: `CPU is at ${health.cpu.usagePct}%. Check the top processes for something runaway or an update running in the background.` });
  for (const d of health.disks ?? []) if (d.usedPct >= 90) r.push({ level: 'warn', text: `Drive ${d.drive} is ${d.usedPct}% full. Empty the Recycle Bin, run Storage Sense / Disk Cleanup, and review large files.` });
  if (health.uptimeHours >= 24 * 7) r.push({ level: 'info', text: `The machine has been up for about ${Math.round(health.uptimeHours / 24)} days. A restart can clear memory leaks and apply pending updates.` });
  const heavy = procs?.top?.[0]; if (heavy && heavy.memoryBytes > 1.5e9) r.push({ level: 'info', text: `"${heavy.name}" is using about ${(heavy.memoryBytes / 1e9).toFixed(1)} GB of RAM.` });
  if (health.battery?.healthPct != null && health.battery.healthPct < 50) {
    r.push({ level: 'bad', text: `Battery health is critically degraded at ${health.battery.healthPct}% (over ${health.battery.degradationPct}% capacity lost). Condition is VERY POOR. Plan for battery replacement and keep the laptop plugged in during demanding tasks.` });
  } else if (health.battery?.healthPct != null && health.battery.healthPct < 75) {
    r.push({ level: 'warn', text: `Battery health has degraded to ${health.battery.healthPct}%. Backup time is noticeably reduced.` });
  }
  if (!r.length) r.push({ level: 'ok', text: 'No obvious problems in the metrics collected. These readings are a snapshot, not a full diagnosis.' });
  return r;
}

const PROTECTED = /^(system|smss|csrss|wininit|winlogon|services|lsass|svchost|explorer|dwm|init|systemd|kernel|node)$/i;
/** Kills a process only if pid still maps to the expected name and is not protected. */
export async function killProcess({ pid, expectedName }) {
  const cur = await listProcesses({ limit: 50000 });
  const p = cur?.top?.find((x) => x.pid === pid);
  if (!p) throw httpError(404, 'That process is no longer running.');
  if (p.name.toLowerCase() !== expectedName.toLowerCase()) throw httpError(409, 'The process with that ID is no longer the one you approved.');
  if (PROTECTED.test(p.name.replace(/\.exe$/i, '')) || pid === process.pid || pid <= 4) throw httpError(403, 'That is a protected system process and will not be terminated.');
  process.kill(pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 800));
  const after = await listProcesses({ limit: 50000 });
  if (after?.top?.some((x) => x.pid === pid && x.name === p.name)) throw new Error('Verification failed: process is still running.');
  return true;
}
/** Move-to-quarantine is not used; deletion is real, so only approved dirs and regular files are allowed. */
export async function deleteFiles({ paths }) {
  const deleted = [];
  for (const f of paths) {
    const real = resolveInside(f, config.approvedDirs);
    const st = await fs.promises.lstat(real);
    if (!st.isFile()) throw httpError(400, `Not a regular file: ${path.basename(real)}`);
    await fs.promises.unlink(real);
    if (fs.existsSync(real)) throw new Error(`Verification failed: ${path.basename(real)} still exists.`);
    deleted.push(real);
  }
  return deleted;
}
