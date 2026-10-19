import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma, User } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(author: User, engagementId: string, dto: CreateReviewDto) {
    const e = await this.prisma.engagement.findUnique({
      where: { id: engagementId },
      include: { job: true, workUnits: { where: { status: 'RELEASED' }, take: 1 } },
    });
    if (!e) throw new NotFoundException();
    const subjectId = author.id === e.workerId ? e.job.farmerId : author.id === e.job.farmerId ? e.workerId : null;
    if (!subjectId) throw new ForbiddenException();
    if (e.workUnits.length === 0) {
      throw new BadRequestException({ code: 'NOTHING_TO_REVIEW', message: 'Vous pourrez noter après une journée payée.' });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: { engagementId, authorId: author.id, subjectId, rating: dto.rating, comment: dto.comment?.trim() || null },
        });
        await tx.user.update({
          where: { id: subjectId },
          data: { ratingSum: { increment: dto.rating }, ratingCount: { increment: 1 } },
        });
        return review;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'Vous avez déjà donné votre avis.' });
      }
      throw err;
    }
  }

  forUser(userId: string) {
    return this.prisma.review.findMany({
      where: { subjectId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, rating: true, comment: true, createdAt: true, author: { select: { id: true, name: true } } },
    });
  }
}

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('engagements/:id/reviews')
  create(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, id, dto);
  }

  @Get('users/:id/reviews')
  list(@Param('id') id: string) {
    return this.reviews.forUser(id);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
