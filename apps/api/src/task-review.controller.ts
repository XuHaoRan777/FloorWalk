import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { apiRoutePath, apiRoutes } from '@libs/shared';
import { AuthGuard } from './auth.js';
import { assertRole, type AuthedRequest } from './inspection-queries.js';
import { TaskDecisionService } from './task-decisions.js';
import {
  TASK_SCHEDULER_CLOCK,
  type TaskSchedulerClock,
} from './task-scheduler.js';

@Controller('api')
export class TaskReviewController {
  constructor(
    @Inject(TaskDecisionService)
    private readonly decisions: TaskDecisionService,
    @Inject(TASK_SCHEDULER_CLOCK)
    private readonly clock: TaskSchedulerClock,
  ) {}

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.reviewTaskQueue))
  async queue(@Req() request: AuthedRequest) {
    assertRole(request.user, ...apiRoutes.reviewTaskQueue.roles);
    return this.decisions.listReviewQueue(request.user.orgId);
  }

  @UseGuards(AuthGuard)
  @Get(apiRoutePath(apiRoutes.getTaskReview))
  async getReview(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.getTaskReview.roles);
    return this.decisions.getTaskReview(taskId, request.user.orgId);
  }

  @UseGuards(AuthGuard)
  @Post(apiRoutePath(apiRoutes.decideTaskItem))
  async decideItem(
    @Body() body: unknown,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: AuthedRequest,
  ) {
    assertRole(request.user, ...apiRoutes.decideTaskItem.roles);
    const input = apiRoutes.decideTaskItem.requestSchema.parse(body);
    return this.decisions.decideTaskItem({
      taskId,
      itemId,
      orgId: request.user.orgId,
      actorId: request.user.id,
      result: input.result,
      now: this.clock.now(),
    });
  }
}
