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
        { id: 'u-user', name: '测试用户', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '普通用户', pageAccess: ['inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionStamp'] },
        { id: 'u-no-stamp', name: '无盖章权限用户', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '普通用户', pageAccess: ['inspectionFeedback'] },
        { id: 'u-mei', name: '梅孜琨', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '普通用户', pageAccess: ['inspectionSchedule', 'inspectionFeedback'] },
        { id: 'u-deng', name: '邓颜威', password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 4), role: '普通用户', pageAccess: ['inspectionSchedule', 'inspectionFeedback'] }
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
            supplierShortNames: ['测试供应商', '无地址供应商'],
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
          shippingOaNo: 'FH-OA-20260722',
          supplierShortName: '测试供应商',
          supplierAddress: '广东省深圳市测试路1号',
          businessDepartments: '测试事业部',
          operation: '测试运营',
          firstInspection: '是',
          salesProductLine: '测试产品线',
          series: '测试系列',
          totalQuantity: '10',
          skuQuantity: 'SKU-A 10'
      }]
    });
    const missingShippingBody = JSON.parse(noticeBody('integration-notice-missing-shipping-oa'));
    delete missingShippingBody.rows[0].shippingOaNo;
    const missingShippingResponse = await fetch(baseUrl + '/api/quality-inspection/notices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + login.token
      },
      body: JSON.stringify(missingShippingBody),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(missingShippingResponse.status, 400);
    assert.match(await missingShippingResponse.text(), /发货OA号/);

    const draftBody = JSON.parse(noticeBody('integration-notice-draft'));
    draftBody.rows[0].supplierFinishTime = '';
    draftBody.rows[0].shipmentTime = '';
    const directDraftSubmitResponse = await fetch(`${baseUrl}/api/quality-inspection/notices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify(draftBody),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(directDraftSubmitResponse.status, 400);
    assert.match(await directDraftSubmitResponse.text(), /供应商完工时间/);

    const draftResponse = await fetch(`${baseUrl}/api/quality-inspection/notices/drafts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify(draftBody),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(draftResponse.status, 200, await draftResponse.text());
    const draftListResponse = await fetch(`${baseUrl}/api/quality-inspection/notices/drafts`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(draftListResponse.status, 200);
    assert.ok((await draftListResponse.json()).rows.some((row) => row.id === 'integration-notice-draft'));
    const recordsBeforeDraftSubmit = await fetch(`${baseUrl}/api/quality-inspection/records`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(recordsBeforeDraftSubmit.status, 200);
    assert.ok(!(await recordsBeforeDraftSubmit.json()).rows.some((row) => row.id === 'integration-notice-draft'));

    const completedDraftResponse = await fetch(`${baseUrl}/api/quality-inspection/notices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: noticeBody('integration-notice-draft'),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(completedDraftResponse.status, 200, await completedDraftResponse.text());
    const draftsAfterSubmitResponse = await fetch(`${baseUrl}/api/quality-inspection/notices/drafts`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(draftsAfterSubmitResponse.status, 200);
    assert.ok(!(await draftsAfterSubmitResponse.json()).rows.some((row) => row.id === 'integration-notice-draft'));
    const recordsAfterDraftSubmit = await fetch(`${baseUrl}/api/quality-inspection/records`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(recordsAfterDraftSubmit.status, 200);
    assert.ok((await recordsAfterDraftSubmit.json()).rows.some((row) => row.id === 'integration-notice-draft'));

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

    const noAddressSupplierBody = JSON.parse(noticeBody('integration-notice-no-address-supplier'));
    noAddressSupplierBody.rows[0].supplierShortName = '无地址供应商';
    noAddressSupplierBody.rows[0].supplierAddress = '';
    const noAddressSupplierResponse = await fetch(`${baseUrl}/api/quality-inspection/notices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify(noAddressSupplierBody),
      signal: AbortSignal.timeout(10000)
    });
    const noAddressSupplierText = await noAddressSupplierResponse.text();
    assert.equal(noAddressSupplierResponse.status, 200, noAddressSupplierText);
    const noAddressSupplierRecord = JSON.parse(noAddressSupplierText).rows
      .find((row) => row.id === 'integration-notice-no-address-supplier');
    assert.equal(noAddressSupplierRecord?.supplierShortName, '无地址供应商');
    assert.equal(noAddressSupplierRecord?.supplierAddress, '');

    const deleteFeedbackResponse = await fetch(`${baseUrl}/api/quality-inspection/notices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: noticeBody('integration-delete-feedback'),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deleteFeedbackResponse.status, 200, await deleteFeedbackResponse.text());

    const scheduleResponse = await fetch(`${baseUrl}/api/quality-inspection/schedules/integration-notice-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify({
        inspector: '梅孜琨',
        scheduledDate: '2026-07-29',
        status: '已安排'
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(scheduleResponse.status, 200, await scheduleResponse.text());
    const scheduleMessage = await waitForDingTalkMessage(dingTalkMessages, '安排验货');
    [
      '供应商简称：测试供应商',
      '产品线：测试产品线',
      '系列：测试系列',
      '是否新品：是',
      'SKU及数量：SKU-A 10',
      '数量：10',
      '事业部：测试事业部',
      '运营：测试运营',
      '验货通知人：孙立柱',
      '地址：广东省深圳市',
      '可验货时间：2026-07-22',
      '验货员：梅孜琨',
      '计划验货时间：2026-07-29'
    ].forEach((expected) => assert.match(scheduleMessage, new RegExp(expected)));

    const userLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '测试用户', password }),
      signal: AbortSignal.timeout(10000)
    });
    const userLoginText = await userLoginResponse.text();
    assert.equal(userLoginResponse.status, 200, userLoginText);
    const userLogin = JSON.parse(userLoginText);
    const deniedScheduleDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/notices/integration-notice-no-address-supplier`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deniedScheduleDeleteResponse.status, 403, await deniedScheduleDeleteResponse.text());
    const deniedReportDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/reports/integration-delete-feedback`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deniedReportDeleteResponse.status, 403, await deniedReportDeleteResponse.text());
    const deniedFeedbackDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/records/integration-delete-feedback`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deniedFeedbackDeleteResponse.status, 403, await deniedFeedbackDeleteResponse.text());

    const namedDeleteLogin = async (name) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
        signal: AbortSignal.timeout(10000)
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      return JSON.parse(text);
    };
    const meiLogin = await namedDeleteLogin('梅孜琨');
    const meiScheduleDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/notices/integration-notice-no-address-supplier`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${meiLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(meiScheduleDeleteResponse.status, 200, await meiScheduleDeleteResponse.text());
    const dengLogin = await namedDeleteLogin('邓颜威');
    const dengReportDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/reports/integration-delete-feedback`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dengLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(dengReportDeleteResponse.status, 200, await dengReportDeleteResponse.text());
    const dengFeedbackDeleteResponse = await fetch(`${baseUrl}/api/quality-inspection/records/integration-delete-feedback`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dengLogin.token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(dengFeedbackDeleteResponse.status, 200, await dengFeedbackDeleteResponse.text());
    const stampHeaders = { Authorization: `Bearer ${userLogin.token}` };
    const stampListResponse = await fetch(`${baseUrl}/api/quality-inspection/stamp-reports`, {
      headers: stampHeaders,
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(stampListResponse.status, 200, await stampListResponse.text());
    const stampResponse = await fetch(`${baseUrl}/api/quality-inspection/reports/missing-report/stamp`, {
      method: 'POST',
      headers: stampHeaders,
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(stampResponse.status, 404, await stampResponse.text());
    const rejectResponse = await fetch(`${baseUrl}/api/quality-inspection/reports/missing-report/reject`, {
      method: 'POST',
      headers: stampHeaders,
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(rejectResponse.status, 404, await rejectResponse.text());
    const stampUploadResponse = await fetch(`${baseUrl}/api/quality-inspection/report-files`, {
      method: 'POST',
      headers: stampHeaders,
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(stampUploadResponse.status, 400, await stampUploadResponse.text());
    const noStampLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '无盖章权限用户', password }),
      signal: AbortSignal.timeout(10000)
    });
    const noStampLoginText = await noStampLoginResponse.text();
    assert.equal(noStampLoginResponse.status, 200, noStampLoginText);
    const deniedStampListResponse = await fetch(`${baseUrl}/api/quality-inspection/stamp-reports`, {
      headers: { Authorization: `Bearer ${JSON.parse(noStampLoginText).token}` },
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deniedStampListResponse.status, 403, await deniedStampListResponse.text());
    const authorizedScheduleResponse = await fetch(`${baseUrl}/api/quality-inspection/schedules/integration-notice-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userLogin.token}`
      },
      body: JSON.stringify({
        inspector: '页面授权验货员',
        scheduledDate: '2026-07-31',
        status: '已安排'
      }),
      signal: AbortSignal.timeout(10000)
    });
    const authorizedScheduleText = await authorizedScheduleResponse.text();
    assert.equal(authorizedScheduleResponse.status, 200, authorizedScheduleText);
    assert.equal(JSON.parse(authorizedScheduleText).inspector, '页面授权验货员');
    const deniedInspectorResponse = await fetch(`${baseUrl}/api/quality-inspection/feedback/integration-notice-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userLogin.token}`
      },
      body: JSON.stringify({ assignedInspector: '无权修改' }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(deniedInspectorResponse.status, 403, await deniedInspectorResponse.text());

    const batchScheduleResponse = await fetch(`${baseUrl}/api/quality-inspection/schedules`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userLogin.token}`
      },
      body: JSON.stringify({
        items: [{
          id: 'integration-notice-2',
          inspector: '测试批量验货员',
          scheduledDate: '2026-07-30',
          status: '已安排'
        }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(batchScheduleResponse.status, 200, await batchScheduleResponse.text());
    const batchScheduleMessage = await waitForDingTalkMessage(dingTalkMessages, '批量安排验货');
    [
      '#### 验货安排 1',
      '供应商简称：测试供应商',
      'SKU及数量：SKU-A 10',
      '验货员：测试批量验货员',
      '计划验货时间：2026-07-30'
    ].forEach((expected) => assert.match(batchScheduleMessage, new RegExp(expected)));

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
        assignedInspector: '管理员修改验货员',
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
    const updatedRecordsResponse = await fetch(`${baseUrl}/api/quality-inspection/records`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    const updatedRecordsText = await updatedRecordsResponse.text();
    assert.equal(updatedRecordsResponse.status, 200, updatedRecordsText);
    const updatedRecords = JSON.parse(updatedRecordsText);
    assert.equal(
      updatedRecords.rows.find((record) => record.id === 'integration-notice-1')?.schedule?.inspector,
      '管理员修改验货员'
    );
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

    const timeChangeResponse = await fetch(`${baseUrl}/api/quality-inspection/feedback/integration-notice-2`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify({
        actualInspectionTime: '2026-07-30',
        actualInspector: '测试批量验货员',
        inspectionQuantity: '10',
        result: '验货时间变更',
        feedbackText: '供应商申请调整验货时间'
      }),
      signal: AbortSignal.timeout(10000)
    });
    const timeChangeText = await timeChangeResponse.text();
    assert.equal(timeChangeResponse.status, 200, timeChangeText);
    const timeChangeFeedback = JSON.parse(timeChangeText);
    assert.equal(timeChangeFeedback.result, '验货时间变更');
    assert.equal(timeChangeFeedback.rework?.status, '待复验');

    const timeChangeCompleteResponse = await fetch(`${baseUrl}/api/quality-inspection/feedback/integration-notice-2`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      },
      body: JSON.stringify({
        ...timeChangeFeedback,
        rework: {
          ...timeChangeFeedback.rework,
          reworkCompleteTime: '2026-08-05',
          reworkRemark: '改到新时间验货'
        },
        reworkSchedule: {}
      }),
      signal: AbortSignal.timeout(10000)
    });
    assert.equal(timeChangeCompleteResponse.status, 200, await timeChangeCompleteResponse.text());
    const timeChangeRecordsResponse = await fetch(`${baseUrl}/api/quality-inspection/records`, {
      headers: { Authorization: `Bearer ${login.token}` },
      signal: AbortSignal.timeout(10000)
    });
    const timeChangeRecordsText = await timeChangeRecordsResponse.text();
    assert.equal(timeChangeRecordsResponse.status, 200, timeChangeRecordsText);
    const timeChangeRecord = JSON.parse(timeChangeRecordsText).rows.find((record) => record.id === 'integration-notice-2');
    assert.equal(timeChangeRecord?.feedback?.result, '验货时间变更');
    assert.equal(timeChangeRecord?.rework?.status, '待安排验货');
    assert.equal(timeChangeRecord?.shipmentTime, '2026-08-05');
    assert.equal(timeChangeRecord?.schedule?.status, '未安排');
    assert.equal(timeChangeRecord?.schedule?.inspector, '');

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
