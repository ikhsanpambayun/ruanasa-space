import { Controller, Get } from '@nestjs/common';

import { AppService, type HealthStatus } from './app.service';
import { ResponseMessage } from './common/decorators/response-message.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check untuk monitoring (UptimeRobot) dan platform hosting.
   *
   * @returns Status, timestamp, dan uptime.
   */
  @Get('health')
  @ResponseMessage('OK')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
