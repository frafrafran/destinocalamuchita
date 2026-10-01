import "server-only";
import nodemailer from "nodemailer";
import { env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface ChannelSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmail implements ChannelSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`\n──── email (console driver) ────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n────────────────────────────────\n`);
  }
}

class SmtpEmail implements ChannelSender {
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: env.EMAIL_FROM, ...message });
  }
}

class ResendEmail implements ChannelSender {
  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

let sender: ChannelSender | undefined;

export function emailSender(): ChannelSender {
  sender ??= env.EMAIL_DRIVER === "smtp" ? new SmtpEmail() : env.EMAIL_DRIVER === "resend" ? new ResendEmail() : new ConsoleEmail();
  return sender;
}
