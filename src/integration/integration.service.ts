import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationService {
    private readonly logger = new Logger(IntegrationService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    async generateSsoUrl(userId: string, dealerId?: string): Promise<string> {
        this.logger.log(`Generating SSO URL for user ${userId} and dealer ${dealerId}`);
        
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: true,
            },
        });

        if (!user) {
            throw new Error('User not found');
        }

        const dsRole = user.role?.name?.toLowerCase() || 'employee';
        const isSuperAdmin = dsRole === 'super-admin' || dsRole === 'admin' && !dealerId;

        let dealer: any = null;
        let hrmRole: string;
        let effectiveDealerId: string;
        let dealerName: string;

        if (isSuperAdmin) {
            // SuperAdmin scenario: use userId as both dealer_id and user_id
            this.logger.log(`SuperAdmin detected: ${user.email}. Using userId as dealer_id.`);
            effectiveDealerId = user.id;
            dealerName = `${user.firstName} ${user.lastName} (Admin)`;
            hrmRole = 'admin';
        } else {
            // Regular dealer/user scenario
            if (dealerId) {
                dealer = await this.prisma.dealer.findUnique({
                    where: { id: dealerId },
                });
            }

            // If no dealer found by ID, try finding by email if role is dealer
            if (!dealer && dsRole === 'dealer') {
                dealer = await this.prisma.dealer.findUnique({
                    where: { email: user.email },
                });
            }

            if (!dealer) {
                this.logger.warn(`No dealer found for user ${user.email}`);
                throw new Error('Dealer context required for HRM integration');
            }

            effectiveDealerId = dealer.id;
            dealerName = dealer.businessNameLegal || dealer.businessNameTrading || 'Unknown Dealer';
            
            // Dealers get 'HR' role in HRM system
            hrmRole = 'hr';
        }

        const payload = {
            dealer_id: effectiveDealerId, 
            dealer_name: dealerName,
            user_id: user.id,
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            role: hrmRole,
            iss: 'drivesafe',
            aud: this.configService.get('DRIVESAFE_SSO_AUDIENCE', 'hrm'),
        };

        const secret = this.configService.get<string>('DRIVESAFE_SSO_SECRET');
        this.logger.log(`SSO Config Check - Secret Exists: ${!!secret}`);
        if (!secret) {
            this.logger.error('DRIVESAFE_SSO_SECRET is not configured');
            throw new Error('SSO configuration error');
        }

        const token = jwt.sign(payload, secret, {
            algorithm: 'HS256',
            expiresIn: '5m', // Short-lived token for redirect
        });

        const hrmUrl = this.configService.get<string>('HRM_SSO_URL');
        this.logger.log(`SSO Config Check - HRM URL: ${hrmUrl}`);
        if (!hrmUrl) {
           this.logger.error('HRM_SSO_URL is not configured');
           throw new Error('SSO configuration error');
        }

        // Check if hrmUrl already has query params check
        const separator = hrmUrl.includes('?') ? '&' : '?';
        const finalUrl = `${hrmUrl}${separator}token=${token}`;
        this.logger.log(`Generated SSO URL: ${finalUrl}`);
        return finalUrl;
    }
}
