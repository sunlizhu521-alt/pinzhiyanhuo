import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Retry while the isolated server initializes.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('isolated server did not become healthy');
}

test('concurrent login and notice submission complete through the HTTP API', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pinzhiyanhuo-server-test-'));
  const password = 'integration-pass';
  const port = 43000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATA_DIR: tempDir,
    PORT: String(port),
    ADMIN_PASSWORD: password,
    DINGTALK_WEBHOOK: '',
    DINGTALK_SECRET: ''
  };
  const seed = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import bcrypt from 'bcryptjs';
    import { initDatabase, saveDatabaseState } from './server/database.js';
    await initDatabase();
    saveDatabaseState({
      users: [
        { id: 'u-admin', name: '孙立柱', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '管理员', pageAccess: [] },
        { id: 'u-user', name: '测试用户', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '普通用户', pageAccess: ['inspectionNotice'] }
      ],
      sessions: {},
      qualityInspection: {
        notices: { rows: [], submittedAt: '', submittedBy: '' },
        schedules: {},
        reports: {},
        feedback: {},
        dimensionLibrary: {
          'dimension-slot-1': {
            salesProductLines: ['测试产品线'],
            salesSeries: ['测试系列'],
            seriesByProductLine: { '测试产品线': ['测试系列'] }
          },
          'dimension-slot-2': {
            supplierShortNames: ['测试供应商'],
            supplierAddressLookup: [{ supplierShortName: '测试供应商', provinceCity: '广东省深圳市' }]
          }
        },
        initialData: {}
      }
    });
  `], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr || seed.stdout);

  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const childExited = new Promise((resolve) => child.once('exit', resolve));
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForHealth(baseUrl, child);
    const loginStartedAt = Date.now();
    const loginCredentials = [
      ...Array.from({ length: 12 }, () => ({ name: '孙立柱', password })),
      ...Array.from({ length: 12 }, () => ({ name: '测试用户', password }))
    ];
    const logins = await Promise.all(loginCredentials.map((credentials) => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      signal: AbortSignal.timeout(10000)
    })));
    assert.ok(logins.every((response) => response.ok), `login responses: ${logins.map((response) => response.status).join(', ')}`);
    assert.ok(Date.now() - loginStartedAt < 10000, 'concurrent logins exceeded 10 seconds');
    await Promise.all(logins.map((response) => response.json()));
    const latestLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '孙立柱', password }),
      signal: AbortSignal.timeout(10000)
    });
    const latestLoginText = await latestLoginResponse.text();
    assert.equal(latestLoginResponse.status, 200, latestLoginText);
    const login = JSON.parse(latestLoginText);
    assert.ok(login.token);

    const noticeBody = (id) => JSON.stringify({
      rows: [{
          id,
          inspectionNotifier: '孙立柱',
          inspectionFillTime: '2026-07-20',
          supplierFinishTime: '2026-07-21',
          shipmentTime: '2026-07-22',
          supplierShortName: '测试供应商',
          businessDepartments: '测试事业部',
          operation: '测试运营',
          firstInspection: '是',
          salesProductLine: '测试产品线',
          series: '测试系列',
          totalQuantity: '10'
      }]
    });
    const noticeResponses = await Promise.all(['integration-notice-1', 'integration-notice-2'].map((id) => (
      fetch(`${baseUrl}/api/quality-inspection/notices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${login.token}`
        },
        body: noticeBody(id),
        signal: AbortSignal.timeout(10000)
      })
    )));
    const noticeResponseTexts = await Promise.all(noticeResponses.map((response) => response.text()));
    assert.ok(noticeResponses.every((response) => response.status === 200), `${noticeResponseTexts.join('\n')}\n${output}`);

    const recordsResponse = await fetch(`${baseUrl}/api/quality-inspection/records`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    const recordsResponseText = await recordsResponse.text();
    assert.equal(recordsResponse.status, 200, recordsResponseText);
    const records = JSON.parse(recordsResponseText);
    assert.ok(records.rows.some((record) => record.id === 'integration-notice-1'));
    assert.ok(records.rows.some((record) => record.id === 'integration-notice-2'));
  } finally {
    child.kill();
    await Promise.race([
      childExited,
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await Promise.race([
        childExited,
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    }
    child.stdout.destroy();
    child.stderr.destroy();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
