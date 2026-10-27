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

@Module({
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
  controllers: [
    HealthController,
    AuthController,
    InspectionController,
    EvidenceController,
    ReviewController,
    DashboardController,
    StorageController,
  ],
})
export class AppModule {}
