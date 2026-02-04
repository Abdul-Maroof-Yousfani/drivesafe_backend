import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { HrmSsoResponseDto } from './dto/hrm-sso.dto';

@ApiTags('Integration')
@Controller('integration')
export class IntegrationController {
    constructor(private readonly integrationService: IntegrationService) { }

    @Get('hrm/sso-url')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Generate SSO URL for HRM' })
    @ApiResponse({ status: 200, type: HrmSsoResponseDto })
    async getHrmSsoUrl(@Req() req): Promise<HrmSsoResponseDto> {
        const userId = req.user.userId;
        const dealerId = req.user.dealerId;
        
        const url = await this.integrationService.generateSsoUrl(userId, dealerId);
        return { url };
    }
}
