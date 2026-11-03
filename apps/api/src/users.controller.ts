import {
  Controller,
  Get,
  NotImplementedException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { apiRoutePath, apiRoutes } from '@libs/shared';
import { AuthGuard } from './auth.js';
import { assertRole, type AuthedRequest } from './inspection-queries.js';

@Controller('api')
@UseGuards(AuthGuard)
export class UsersController {
  @Get(apiRoutePath(apiRoutes.listAdminUsers))
  listUsers(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.listAdminUsers.roles);
    throw new NotImplementedException();
  }

  @Post(apiRoutePath(apiRoutes.createAdminUser))
  createUser(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.createAdminUser.roles);
    throw new NotImplementedException();
  }

  @Patch(apiRoutePath(apiRoutes.updateAdminUser))
  updateUser(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.updateAdminUser.roles);
    throw new NotImplementedException();
  }

  @Post(apiRoutePath(apiRoutes.resetAdminUserPassword))
  resetPassword(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.resetAdminUserPassword.roles);
    throw new NotImplementedException();
  }

  @Post(apiRoutePath(apiRoutes.changePassword))
  changePassword(@Req() request: AuthedRequest): never {
    assertRole(request.user, ...apiRoutes.changePassword.roles);
    throw new NotImplementedException();
  }
}
