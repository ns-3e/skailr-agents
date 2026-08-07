// DOC: Mock email adapter (existing, working). No real external email
// dependency — messages are captured in-memory so tests/graders can assert
// on what would have been sent. Use `sendEmail` for any outbound email
// (e.g. invitation emails); do not introduce a real SMTP/API-based provider.
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  sentAt: number;
}

const outbox: EmailMessage[] = [];

export async function sendEmail(input: { to: string; subject: string; body: string }): Promise<EmailMessage> {
  const message: EmailMessage = { ...input, sentAt: Date.now() };
  outbox.push(message);
  return message;
}

export function getOutbox(): readonly EmailMessage[] {
  return outbox;
}

export function findEmailsTo(to: string): EmailMessage[] {
  return outbox.filter((m) => m.to.toLowerCase() === to.toLowerCase());
}

// Test-only helper.
export function __resetOutboxForTests(): void {
  outbox.length = 0;
}
