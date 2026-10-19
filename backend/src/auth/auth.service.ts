import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { hmacSha256, numericCode, randomToken, safeEqualHex } from '../common/crypto';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from './sms/sms.provider';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  private codeHash(phone: string, code: string) {
    return hmacSha256(this.config.otpSecret, `${phone}:${code}`);
  }

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone, this.config.allowedCountries);
    const since = new Date(Date.now() - this.config.otpWindowSec * 1000);
    const recent = await this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: since } } });
    if (recent >= this.config.otpMaxPerWindow) {
      throw new HttpException(
        { code: 'OTP_RATE_LIMITED', message: 'Trop de codes demandés. Réessayez dans quelques minutes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = numericCode(6);
    await this.prisma.otpChallenge.create({
      data: {
        phone,
        codeHash: this.codeHash(phone, code),
        expiresAt: new Date(Date.now() + this.config.otpTtlSec * 1000),
      },
    });
    await this.sms.send(phone, `Nogoman : votre code est ${code}. Ne le donnez à personne.`);
    return { phone, expiresInSec: this.config.otpTtlSec };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone, this.config.allowedCountries);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'Code expiré. Demandez un nouveau code.' });
    }
    if (challenge.attempts >= this.config.otpMaxAttempts) {
      throw new BadRequestException({ code: 'OTP_TOO_MANY_ATTEMPTS', message: 'Trop d’essais. Demandez un nouveau code.' });
    }
    if (!safeEqualHex(challenge.codeHash, this.codeHash(phone, code))) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException({ code: 'OTP_INVALID', message: 'Code incorrect.' });
    }
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'Code expiré. Demandez un nouveau code.' });
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const user =
      existing ??
      (await this.prisma.user.create({
        data: { phone, role: this.config.adminPhones.includes(phone) ? Role.ADMIN : null },
      }));
    if (user.disabledAt) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Compte désactivé.' });

    const tokens = await this.issueTokens(user);
    return { ...tokens, isNewUser: !existing, user };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const refreshHash = hmacSha256(this.config.jwtSecret, refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshHash }, include: { user: true } });
    if (!session) throw new UnauthorizedException();
    if (session.revokedAt) {
      // A rotated token was reused: assume it leaked and end every session of this user.
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (session.expiresAt <= new Date() || session.user.disabledAt) throw new UnauthorizedException();

    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count !== 1) throw new UnauthorizedException();
    return this.issueTokens(session.user);
  }

  async logout(refreshToken: string) {
    const refreshHash = hmacSha256(this.config.jwtSecret, refreshToken);
    await this.prisma.session.updateMany({ where: { refreshHash, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: user.id }, { expiresIn: this.config.accessTokenTtlSec });
    const refreshToken = randomToken();
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshHash: hmacSha256(this.config.jwtSecret, refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 3600 * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.config.accessTokenTtlSec };
  }
}
