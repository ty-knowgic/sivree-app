import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function connectTailnetPreview({ backendPort, httpsPort, run = execute }) {
  const status = JSON.parse((await run('tailscale', ['status', '--json'], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout);
  if (status.BackendState !== 'Running') throw Error('Tailscaleに接続してください。');
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (!hostname || !/^[a-z0-9.-]+\.ts\.net$/i.test(hostname)) throw Error('TailscaleのDNS名を取得できません。');
  const url = `https://${hostname}:${httpsPort}`;
  const config = JSON.parse((await run('tailscale', ['serve', 'status', '--json'], { timeout: 5000 })).stdout);
  const target = `http://127.0.0.1:${backendPort}`;
  const existing = config.Web?.[`${hostname}:${httpsPort}`]?.Handlers?.['/']?.Proxy;
  if (config.TCP?.[httpsPort] || config.Web?.[`${hostname}:${httpsPort}`]) {
    if (existing?.replace(/\/$/, '') !== target) throw Error(`Tailscaleの${httpsPort}番は別のサービスが使用中です。既存設定は変更していません。`);
    return { url, reused: true };
  }
  if (!status.CertDomains?.includes(hostname)) return { enableUrl: `https://login.tailscale.com/f/serve?node=${encodeURIComponent(status.Self.ID)}` };
  await run('tailscale', ['serve', '--bg', `--https=${httpsPort}`, target], { timeout: 10000 });
  return { url, reused: false };
}
