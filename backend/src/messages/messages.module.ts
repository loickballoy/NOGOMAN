import {
  Body, Controller, Get, HttpCode, Module, Param, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators';
import { MessagesService, UploadedAudio } from './messages.service';

class SendTextDto {
  @ApiProperty() @IsString() @Length(1, 1000) text: string;
}

class VoiceQueryDto {
  @ApiProperty({ description: 'Recording length in milliseconds', required: false })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(600_000) durationMs?: number;
}

class PageDto {
  @IsOptional() @IsISO8601() before?: string;
}

@ApiTags('messages')
@ApiBearerAuth()
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  list(@CurrentUser() user: User) {
    return this.messages.list(user);
  }

  @Get('conversations/unread')
  unread(@CurrentUser() user: User) {
    return this.messages.unreadTotal(user);
  }

  @Post('applications/:id/conversation')
  open(@CurrentUser() user: User, @Param('id') applicationId: string) {
    return this.messages.openForApplication(user, applicationId);
  }

  @Get('conversations/:id/messages')
  page(@CurrentUser() user: User, @Param('id') id: string, @Query() q: PageDto) {
    return this.messages.messages(user, id, q.before);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  send(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SendTextDto) {
    return this.messages.sendText(user, id, dto.text);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  /**
   * Two ways in: the raw audio as the body (Content-Type: audio/mp4, ?durationMs=...), which is
   * what the app sends, or a multipart form with an "audio" file and a durationMs field.
   */
  @Post('conversations/:id/voice')
  @ApiConsumes('audio/mp4', 'multipart/form-data')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  voice(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFile() upload: UploadedAudio | undefined,
    @Query() q: VoiceQueryDto,
    @Req() req: Request,
  ) {
    const rawBody = Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : null;
    const file: UploadedAudio | undefined = rawBody
      ? { buffer: rawBody, mimetype: String(req.headers['content-type'] ?? ''), size: rawBody.length }
      : upload;
    const durationMs = q.durationMs ?? Number(rawBody ? NaN : (req.body as Record<string, unknown>)?.durationMs);
    return this.messages.sendVoice(user, id, file, durationMs);
  }

  @Get('messages/:id/audio')
  async audio(@CurrentUser() user: User, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { stream, type } = await this.messages.audio(user, id);
    // The web build runs on another origin; the route still requires the bearer token.
    res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=86400', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    return new StreamableFile(stream);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: User, @Param('id') id: string) {
    await this.messages.markRead(user, id);
  }
}

@Module({ controllers: [MessagesController], providers: [MessagesService] })
export class MessagesModule {}
