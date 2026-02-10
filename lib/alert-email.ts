import net from 'node:net';
import tls from 'node:tls';
import { executeUpstashCommand } from './upstash-rest';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
}

export interface EmailResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
}

export interface SendAlertEmailInput {
  subject: string;
  text: string;
  dedupKey?: string;
  dedupWindowSeconds?: number;
}

function getConfig(): EmailConfig | null {
  const host = process.env.ALERT_SMTP_HOST;
  const from = process.env.ALERT_EMAIL_FROM;
  const toRaw = process.env.ALERT_EMAIL_TO;
  if (!host || !from || !toRaw) return null;

  const port = Number(process.env.ALERT_SMTP_PORT || '465');
  const secureRaw = (process.env.ALERT_SMTP_SECURE || '').toLowerCase();
  const secure = secureRaw ? secureRaw === 'true' || secureRaw === '1' : port === 465;

  const to = toRaw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  if (to.length === 0) return null;

  return {
    host,
    port,
    secure,
    user: process.env.ALERT_SMTP_USER,
    pass: process.env.ALERT_SMTP_PASS,
    from,
    to,
  };
}

function asBase64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64');
}

async function acquireDedupLock(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await executeUpstashCommand(['SET', `alert-lock:${key}`, Date.now().toString(), 'EX', ttlSeconds, 'NX']);
  if (result === null) {
    // Fail-open if redis unavailable
    return true;
  }
  return String(result).toUpperCase() === 'OK';
}

async function sendSmtpEmail(config: EmailConfig, subject: string, text: string): Promise<void> {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.createConnection({ host: config.host, port: config.port });

  socket.setEncoding('utf8');
  socket.setTimeout(15000);

  let buffer = '';
  let pending:
    | {
        resolve: (value: { code: number; lines: string[] }) => void;
        reject: (reason?: unknown) => void;
        lines: string[];
        timer: NodeJS.Timeout;
      }
    | null = null;

  const cleanup = () => {
    if (pending) {
      clearTimeout(pending.timer);
      pending = null;
    }
  };

  const readResponse = () =>
    new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
      if (pending) {
        reject(new Error('SMTP read pipeline conflict'));
        return;
      }
      const timer = setTimeout(() => {
        pending = null;
        reject(new Error('SMTP response timeout'));
      }, 15000);

      pending = { resolve, reject, lines: [], timer };
    });

  const handleLine = (line: string) => {
    if (!pending) return;
    pending.lines.push(line);
    if (/^\d{3} /.test(line)) {
      const code = Number(line.slice(0, 3));
      const payload = { code, lines: [...pending.lines] };
      clearTimeout(pending.timer);
      pending.resolve(payload);
      pending = null;
    }
  };

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf('\r\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleLine(line);
      idx = buffer.indexOf('\r\n');
    }
  });

  socket.on('timeout', () => {
    if (pending) {
      pending.reject(new Error('SMTP socket timeout'));
      cleanup();
    }
    socket.destroy();
  });

  socket.on('error', (err) => {
    if (pending) {
      pending.reject(err);
      cleanup();
    }
  });

  const send = async (command: string, expectedCodes: number[]) => {
    socket.write(`${command}\r\n`);
    const response = await readResponse();
    if (!expectedCodes.includes(response.code)) {
      throw new Error(`SMTP ${command.split(' ')[0]} failed: ${response.lines.join(' | ')}`);
    }
  };

  try {
    const greeting = await readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greeting.lines.join(' | ')}`);
    }

    await send('EHLO facilabo.local', [250]);

    if (config.user && config.pass) {
      await send('AUTH LOGIN', [334]);
      await send(asBase64(config.user), [334]);
      await send(asBase64(config.pass), [235]);
    }

    await send(`MAIL FROM:<${config.from}>`, [250]);
    for (const recipient of config.to) {
      await send(`RCPT TO:<${recipient}>`, [250, 251]);
    }

    await send('DATA', [354]);

    const payload = [
      `From: ${config.from}`,
      `To: ${config.to.join(', ')}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      '',
      '.',
    ].join('\r\n');

    socket.write(`${payload}\r\n`);
    const dataResp = await readResponse();
    if (dataResp.code !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResp.lines.join(' | ')}`);
    }

    await send('QUIT', [221, 250]);
  } finally {
    socket.end();
    cleanup();
  }
}

export async function sendAlertEmail(input: SendAlertEmailInput): Promise<EmailResult> {
  const config = getConfig();
  if (!config) {
    return { sent: false, skipped: true, reason: 'missing_email_config' };
  }

  const dedupKey = input.dedupKey?.trim();
  const dedupWindow = input.dedupWindowSeconds ?? 1800;
  if (dedupKey) {
    const lockAcquired = await acquireDedupLock(dedupKey, dedupWindow);
    if (!lockAcquired) {
      return { sent: false, skipped: true, reason: 'dedup_lock_active' };
    }
  }

  try {
    await sendSmtpEmail(config, input.subject, input.text);
    return { sent: true, skipped: false };
  } catch (error) {
    return {
      sent: false,
      skipped: true,
      reason: error instanceof Error ? error.message : 'smtp_error',
    };
  }
}
