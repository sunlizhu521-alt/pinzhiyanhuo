import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';

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

async function waitForDingTalkMessage(messages, action) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const message = messages.find((item) => item?.markdown?.text?.includes(`操作内容：${action}`));
    if (message) return message.markdown.text;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`DingTalk message not received for: ${action}`);
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

  const dingTalkMessages = [];
  const dingTalkServer = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (body) dingTalkMessages.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"errcode":0}');
    });
  });
  await new Promise((resolve) => dingTalkServer.listen(0, '127.0.0.1', resolve));
  const dingTalkAddress = dingTalkServer.address();
  env.DINGTALK_WEBHOOK = `http://127.0.0.1:${dingTalkAddress.port}/robot/send`;

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

    const feedbackResponse = await fetch(`${baseUrl}/api/quality-inspection/feedback/integration-notice-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify({
        actualInspectionTime: '2026-07-21',
        actualInspector: '测试验货员',
        inspectionQuantity: '10',
        checkQuantity: '8',
        qualifiedQuantity: '7',
        result: '返工',
        issueLevel: 'B级',
        issueCategoryPrimary: '外观问题',
        feedbackText: '包装破损'
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(feedbackResponse.status, 200, await feedbackResponse.text());
    const feedbackMessage = await waitForDingTalkMessage(dingTalkMessages, '提交验货反馈');
    [
      '验货通知人：孙立柱',
      '供应商简称：测试供应商',
      '产品线：测试产品线',
      '系列：测试系列',
      '通知数量：10',
      '实际验货数量：10',
      '检验数量：8',
      '合格数量：7',
      '验货结果：返工',
      '实际验货时间：2026-07-21',
      '实际验货人：测试验货员',
      '问题等级：B级',
      '问题分类：外观问题',
      '问题反馈：包装破损'
    ].forEach((expected) => assert.match(feedbackMessage, new RegExp(expected)));

    const directFeedbackResponse = await fetch(`${baseUrl}/api/quality-inspection/direct-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify({
        notice: {
          id: 'integration-direct-feedback',
          supplierShortName: '新增供应商',
          salesProductLine: '新增产品线',
          series: '新增系列',
          totalQuantity: '25'
        },
        feedback: {
          actualInspectionTime: '2026-07-21',
          inspectionQuantity: '20',
          checkQuantity: '18',
          qualifiedQuantity: '18',
          result: '通过'
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(directFeedbackResponse.status, 200, await directFeedbackResponse.text());
    const directFeedbackMessage = await waitForDingTalkMessage(dingTalkMessages, '新增未通知验货反馈');
    [
      '验货通知人：孙立柱',
      '供应商简称：新增供应商',
      '产品线：新增产品线',
      '系列：新增系列',
      '通知数量：25',
      '实际验货数量：20',
      '检验数量：18',
      '合格数量：18',
      '验货结果：通过'
    ].forEach((expected) => assert.match(directFeedbackMessage, new RegExp(expected)));
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
    await new Promise((resolve) => dingTalkServer.close(resolve));
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
