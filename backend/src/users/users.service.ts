import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AppConfig } from '../config/app-config';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly config: AppConfig) {}

  async updateMe(user: User, dto: UpdateMeDto) {
    if (dto.role && user.role && dto.role !== user.role) {
      throw new BadRequestException({ code: 'ROLE_LOCKED', message: 'Le type de compte ne peut pas être changé.' });
    }
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException({ code: 'LOCATION_INCOMPLETE', message: 'lat et lng vont ensemble.' });
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: dto.name?.trim(),
        role: user.role ? undefined : dto.role,
        bio: dto.bio,
        locality: dto.locality,
        lat: dto.lat,
        lng: dto.lng,
        payoutOperator: dto.payoutOperator,
        payoutPhone: dto.payoutPhone ? normalizePhone(dto.payoutPhone, this.config.allowedCountries) : undefined,
      },
    });
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.disabledAt) throw new NotFoundException();
    return user;
  }
}
