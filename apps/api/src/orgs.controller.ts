import { Controller, NotImplementedException, Post } from '@nestjs/common';
import { apiRoutePath, apiRoutes } from '@libs/shared';

@Controller('api')
export class OrgsController {
  @Post(apiRoutePath(apiRoutes.createOrg))
  createOrg(): never {
    throw new NotImplementedException();
  }
}
