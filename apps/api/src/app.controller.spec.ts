import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns status, ISO timestamp, and non-negative uptime', () => {
      const health = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(new Date(health.timestamp).toISOString()).toBe(health.timestamp);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
