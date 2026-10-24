const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3018';

const loginResponse = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'inspector@northbean.example',
    password: 'northbean-demo',
  }),
});
if (!loginResponse.ok)
  throw new Error(`登录失败：HTTP ${loginResponse.status}`);
const { token } = await loginResponse.json();

const submitResponse = await fetch(
  `${baseUrl}/inspections/00000000-0000-0000-0000-000000000001/submit`,
  {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  },
);
if (!submitResponse.ok)
  throw new Error(`提交失败：HTTP ${submitResponse.status}`);
const submitted = await submitResponse.json();
if (submitted.score !== 100) {
  throw new Error(
    `演示链预期重新提交得 100，骨架当前返回 ${submitted.score}；等待 FW-003 实现业务规则。`,
  );
}
