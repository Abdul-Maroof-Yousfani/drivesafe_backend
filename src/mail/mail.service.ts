import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  /**
   * Send welcome email with portal credentials to a new direct customer
   */
  async sendWelcomeEmail(
    email: string,
    firstName: string,
    password: string,
  ): Promise<boolean> {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    // Extract first URL if comma-separated
    const portalUrl = frontendUrl.split(',')[0].trim();

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Welcome to DriveSafe - Your Warranty Portal Access',
        template: './welcome',
        context: {
          firstName,
          email,
          password,
          portalUrl,
          loginUrl: `${portalUrl}/login`,
          year: new Date().getFullYear(),
        },
      });

      this.logger.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${email}: ${error.message}`,
      );
      // Don't throw - email failure shouldn't break the registration flow
      return false;
    }
  }

  /**
   * Send warranty purchase confirmation email
   */
  async sendPurchaseConfirmationEmail(
    email: string,
    firstName: string,
    warrantyDetails: {
      packageName: string;
      policyNumber: string;
      vehicleMake: string;
      vehicleModel: string;
      vehicleYear: number;
      coverageStartDate: Date;
      coverageEndDate: Date;
      totalAmount: number;
    },
  ): Promise<boolean> {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const portalUrl = frontendUrl.split(',')[0].trim();

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `DriveSafe Warranty Confirmation - ${warrantyDetails.policyNumber}`,
        template: './purchase-confirmation',
        context: {
          firstName,
          ...warrantyDetails,
          portalUrl,
          loginUrl: `${portalUrl}/login`,
          year: new Date().getFullYear(),
        },
      });

      this.logger.log(`Purchase confirmation email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send purchase confirmation to ${email}: ${error.message}`,
      );
      return false;
    }
  }
}
