import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        // Handle "src" nesting in dist during some builds vs flattened structure
        const templatePath = join(__dirname, 'templates');
        const altTemplatePath = join(process.cwd(), 'dist', 'mail', 'templates');
        // Require fs dynamically or use a simpler assumption. 
        // Since we are inside an async factory, we can use simple logic or just try to be more robust.
        // Let's use process.cwd() as a fallback anchor if __dirname seems too nested
        // But for now, let's just point to the one that currently exists based on our findings.
        
        return {
          transport: {
            host: config.get('MAIL_HOST') || 'smtp.gmail.com',
            port: config.get('MAIL_PORT') || 587,
            secure: false,
            auth: {
              user: config.get('MAIL_USER'),
              pass: config.get('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: config.get('MAIL_FROM') || '"DriveSafe" <noreply@drivesafe.com>',
          },
          template: {
            dir: templatePath.includes('dist\\src\\') || templatePath.includes('dist/src/') 
               ? altTemplatePath 
               : templatePath,
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
