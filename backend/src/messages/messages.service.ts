import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, Conversation, Message, MessageKind, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { filterContacts } from './contact-filter';

const AUDIO_TYPES: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/3gpp': '3gp',
};
const EXT_TYPES: Record<string, string> = {
  m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', webm: 'audio/webm', ogg: 'audio/ogg', wav: 'audio/wav', '3gp': 'audio/3gpp',
};
const CAN_SEND: ApplicationStatus[] = ['PENDING', 'HIRED'];

export interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class MessagesService {
  private readonly dir: string;

  constructor(private readonly prisma: PrismaService, private readonly config: AppConfig) {
    this.dir = resolve(config.uploadDir, 'voice');
    mkdirSync(this.dir, { recursive: true });
  }

  /** The thread between a worker and the farmer for one application, created on first use. */
  async openForApplication(user: User, applicationId: string) {
    const app = await this.prisma.application.findUnique({ where: { id: applicationId }, include: { job: true } });
    if (!app) throw new NotFoundException();
    if (user.id !== app.workerId && user.id !== app.job.farmerId) throw new ForbiddenException();
    const conversation = await this.prisma.conversation.upsert({
      where: { applicationId },
      update: {},
      create: { applicationId, jobId: app.jobId, farmerId: app.job.farmerId, workerId: app.workerId },
    });
    return { id: conversation.id };
  }

  async list(user: User) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ farmerId: user.id }, { workerId: user.id }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        application: { include: { job: true, worker: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 100,
    });
    const farmers = await this.prisma.user.findMany({ where: { id: { in: conversations.map((c) => c.farmerId) } } });
    const byId = new Map(farmers.map((f) => [f.id, f]));
    return Promise.all(conversations.map(async (c) => {
      const other = c.farmerId === user.id ? c.application.worker : byId.get(c.farmerId)!;
      const last = c.messages[0];
      return {
        id: c.id,
        applicationId: c.applicationId,
        job: { id: c.application.job.id, title: c.application.job.title, locality: c.application.job.locality },
        applicationStatus: c.application.status,
        other: { id: other.id, name: other.name, verified: other.kycLevel >= 1 },
        lastMessage: last ? this.present(last, user) : null,
        unread: await this.unreadIn(c, user),
      };
    }));
  }

  async unreadTotal(user: User) {
    const conversations = await this.prisma.conversation.findMany({ where: { OR: [{ farmerId: user.id }, { workerId: user.id }] } });
    let count = 0;
    for (const c of conversations) count += await this.unreadIn(c, user);
    return { count };
  }

  async messages(user: User, conversationId: string, before?: string) {
    const c = await this.participant(user, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId: c.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.reverse().map((m) => this.present(m, user));
  }

  async sendText(user: User, conversationId: string, raw: string) {
    const c = await this.participant(user, conversationId, true);
    const { text, flags } = filterContacts(raw);
    if (!text.replace(/•••/g, '').trim() && !flags.length) {
      throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'Message vide.' });
    }
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId: c.id, senderId: user.id, kind: MessageKind.TEXT, text, flags } });
      await tx.conversation.update({ where: { id: c.id }, data: { lastMessageAt: m.createdAt, ...this.readField(c, user, m.createdAt) } });
      if (flags.length) await tx.user.update({ where: { id: user.id }, data: { contactFlagCount: { increment: 1 } } });
      return m;
    });
    return this.present(message, user);
  }

  async sendVoice(user: User, conversationId: string, file: UploadedAudio | undefined, durationMs: number) {
    const c = await this.participant(user, conversationId, true);
    if (!file) throw new BadRequestException({ code: 'NO_AUDIO', message: 'Message vocal manquant.' });
    const mime = file.mimetype.split(';')[0].trim().toLowerCase();
    const ext = AUDIO_TYPES[mime];
    if (!ext) throw new BadRequestException({ code: 'BAD_AUDIO', message: 'Format audio non pris en charge.' });
    if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > this.config.maxVoiceSeconds * 1000) {
      throw new BadRequestException({ code: 'BAD_DURATION', message: `Message vocal de ${this.config.maxVoiceSeconds} secondes maximum.` });
    }
    const name = `${randomBytes(16).toString('hex')}.${ext}`;
    writeFileSync(join(this.dir, name), file.buffer);
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: { conversationId: c.id, senderId: user.id, kind: MessageKind.VOICE, audioPath: name, audioMs: Math.round(durationMs), flags: [] },
      });
      await tx.conversation.update({ where: { id: c.id }, data: { lastMessageAt: m.createdAt, ...this.readField(c, user, m.createdAt) } });
      return m;
    });
    return this.present(message, user);
  }

  async audio(user: User, messageId: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m?.audioPath) throw new NotFoundException();
    await this.participant(user, m.conversationId);
    const path = join(this.dir, m.audioPath);
    if (!existsSync(path)) throw new NotFoundException();
    const ext = m.audioPath.split('.').pop() ?? '';
    return { stream: createReadStream(path), type: EXT_TYPES[ext] ?? 'application/octet-stream' };
  }

  async markRead(user: User, conversationId: string) {
    const c = await this.participant(user, conversationId);
    await this.prisma.conversation.update({ where: { id: c.id }, data: this.readField(c, user, new Date()) });
  }

  private present(m: Message, viewer: User) {
    return {
      id: m.id,
      kind: m.kind,
      mine: m.senderId === viewer.id,
      text: m.text,
      audioMs: m.audioMs,
      audioUrl: m.kind === MessageKind.VOICE ? `/messages/${m.id}/audio` : null,
      masked: m.flags.length > 0,
      createdAt: m.createdAt,
    };
  }

  private readField(c: Conversation, user: User, at: Date) {
    return user.id === c.farmerId ? { farmerReadAt: at } : { workerReadAt: at };
  }

  private unreadIn(c: Conversation, user: User) {
    const readAt = user.id === c.farmerId ? c.farmerReadAt : c.workerReadAt;
    return this.prisma.message.count({
      where: { conversationId: c.id, senderId: { not: user.id }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
    });
  }

  private async participant(user: User, conversationId: string, sending = false) {
    const c = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { application: true } });
    if (!c) throw new NotFoundException();
    if (user.id !== c.farmerId && user.id !== c.workerId) throw new ForbiddenException();
    if (sending && !CAN_SEND.includes(c.application.status)) {
      throw new BadRequestException({ code: 'CONVERSATION_CLOSED', message: 'Cette discussion est fermée.' });
    }
    return c;
  }
}
