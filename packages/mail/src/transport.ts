import nodemailer from 'nodemailer';

/** The shape both a real nodemailer transport and a test stub must satisfy. */
interface MailTransport {
  sendMail: (options: unknown) => Promise<unknown>;
}

/** Set by tests to stub the SMTP transport. Null in production and dev. */
let transportForTests: MailTransport | null = null;

/** Point `send` at a stub transport (for tests) and clear any cached real one. */
export function setTransportForTests(transport: MailTransport | null): void {
  transportForTests = transport;
}

/** The transport to send through. Null when no SMTP_HOST is configured. */
export function getTransport(): MailTransport | null {
  if (transportForTests !== null) return transportForTests;
  const host = typeof process !== 'undefined' && process.env && process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_PORT === '465',
    requireTLS: process.env.SMTP_PORT !== '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
  }) as MailTransport;
}
