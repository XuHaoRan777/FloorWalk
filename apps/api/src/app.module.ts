import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { InspectionController } from './inspection.controller.js';
import { StorageController } from './storage.controller.js';
import { AuthController } from './auth.controller.js';
import { EvidenceController } from './evidence.controller.js';
import { ReviewController } from './review.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { AdminController } from './admin.controller.js';
import { RecordsController } from './records.controller.js';
import { ChatController } from './chat.controller.js';
import { OrgsController } from './orgs.controller.js';
import { UsersController } from './users.controller.js';
import { VerificationController } from './verification.controller.js';
import { PasswordRecoveryController } from './password-recovery.controller.js';
import { FakeMailboxController } from './fake-mailbox.controller.js';
import { EmailVerificationService } from './email-verification.js';
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
    { provide: 'STORAGE_DRIVER', useFactory: () => getStorageDriver() },
    { provide: 'AI_REVIEWER', useFactory: () => getAiReviewer() },
  ],
  controllers: [
    HealthController,
    AuthController,
    InspectionController,
    EvidenceController,
    ReviewController,
    DashboardController,
    AdminController,
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
