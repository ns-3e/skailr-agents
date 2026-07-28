import { ChannelMessageSchema, type ChannelMessage } from "./schemas.js";

const MSG_BLOCK =
  /### (MSG-\d+)\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n### MSG-|\n*$)/g;

export function parseChannelMessages(markdown: string): {
  messages: ChannelMessage[];
  errors: string[];
} {
  const messages: ChannelMessage[] = [];
  const errors: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MSG_BLOCK.source, "g");
  while ((match = re.exec(markdown)) !== null) {
    const id = match[1]!;
    const header = match[2]!;
    const body = match[3]!.trim();
    const fields: Record<string, string> = {};
    for (const line of header.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const parsed = ChannelMessageSchema.safeParse({
      id,
      from: fields.from ?? "",
      to: fields.to ?? "",
      type: fields.type,
      re: fields.re,
      status: fields.status,
      body,
    });
    if (!parsed.success) {
      errors.push(`${id}: ${parsed.error.message}`);
    } else {
      messages.push(parsed.data);
    }
  }
  return { messages, errors };
}

export function inboxFromMessages(messages: ChannelMessage[]): ChannelMessage[] {
  return messages.filter(
    (m) =>
      m.status === "open" ||
      m.status === "blocked-on-human" ||
      m.type === "contract-change" ||
      m.to.includes("@human"),
  );
}
