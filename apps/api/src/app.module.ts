import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HealthController } from './health.controller.js';
import { InspectionController } from './inspection.controller.js';
import { StorageController } from './storage.controller.js';
import { AuthController } from './auth.controller.js';
import { EvidenceController } from './evidence.controller.js';
import { ReviewController } from './review.controller.js';
import { DashboardController } from './dashboard.controller.js';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
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
