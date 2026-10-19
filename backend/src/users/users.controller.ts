import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators';
import { UpdateMeDto } from './dto';
import { presentPublic, presentSelf } from './user.presenter';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return presentSelf(user);
  }

  @Patch('me')
  async update(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return presentSelf(await this.users.updateMe(user, dto));
  }

  @Delete('me')
  @HttpCode(204)
  async remove(@CurrentUser() user: User) {
    await this.users.deleteMe(user);
  }

  @Get('users/:id')
  async profile(@Param('id') id: string) {
    return presentPublic(await this.users.getById(id));
  }
}
