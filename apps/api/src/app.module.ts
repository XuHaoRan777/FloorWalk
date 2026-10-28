import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './cors.js';
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
import {
  databasePoolProvider,
  DatabasePoolLifecycle,
} from './db/pool.provider.js';

@Module({
  providers: [
    databasePoolProvider,
    DatabasePoolLifecycle,
    { provide: APP_GUARD, useClass: OriginGuard },
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
  ],
})
export class AppModule {}
