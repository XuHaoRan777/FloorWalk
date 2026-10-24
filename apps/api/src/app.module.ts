import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HealthController } from './health.controller.js';
import { InspectionController } from './inspection.controller.js';
import { StorageController } from './storage.controller.js';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [HealthController, InspectionController, StorageController],
})
export class AppModule {}
