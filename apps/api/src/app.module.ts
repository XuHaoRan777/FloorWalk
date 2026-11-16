import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller.js';
import { InspectionController } from './controllers/inspection.controller.js';
import { StorageController } from './controllers/storage.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { EvidenceController } from './controllers/evidence.controller.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { AdminController } from './controllers/admin.controller.js';
import { AiStandardsController } from './controllers/ai-standards.controller.js';
import { TemplatesController } from './controllers/templates.controller.js';
import { SchedulesController } from './controllers/schedules.controller.js';
import { RecordsController } from './controllers/records.controller.js';
import { ChatController } from './controllers/chat.controller.js';
import { OrgsController } from './controllers/orgs.controller.js';
import { UsersController } from './controllers/users.controller.js';
import { VerificationController } from './controllers/verification.controller.js';
import { PasswordRecoveryController } from './controllers/password-recovery.controller.js';
import {
  TaskSchedulerService,
  TASK_SCHEDULER_CLOCK,
} from './services/task-scheduler.js';
import { TaskDecisionService } from './services/task-decisions.js';
import { AiReviewQueueService } from './services/ai-review-queue.js';
import { TaskReviewController } from './controllers/task-review.controller.js';
import { FakeMailboxController } from './controllers/fake-mailbox.controller.js';
import { EmailVerificationService } from './services/email-verification.js';
import { createEmailSender, EMAIL_SENDER } from './email/index.js';
import { getStorageDriver } from './storage/index.js';
import { getAiReviewer } from './ai/index.js';
import {
  databasePoolProvider,
  DatabasePoolLifecycle,
} from './db/pool.provider.js';

@Module({
  providers: [
    databasePoolProvider,
    DatabasePoolLifecycle,
    { provide: EMAIL_SENDER, useFactory: () => createEmailSender() },
    EmailVerificationService,
    TaskDecisionService,
    AiReviewQueueService,
    TaskSchedulerService,
    { provide: TASK_SCHEDULER_CLOCK, useValue: { now: () => new Date() } },
    { provide: 'STORAGE_DRIVER', useFactory: () => getStorageDriver() },
    { provide: 'AI_REVIEWER', useFactory: () => getAiReviewer() },
  ],
  controllers: [
    HealthController,
    AuthController,
    InspectionController,
    EvidenceController,
    TaskReviewController,
    DashboardController,
    AdminController,
    AiStandardsController,
    TemplatesController,
    SchedulesController,
    RecordsController,
    ChatController,
    StorageController,
    OrgsController,
    UsersController,
    VerificationController,
    PasswordRecoveryController,
    FakeMailboxController,
  ],
})
export class AppModule {}
