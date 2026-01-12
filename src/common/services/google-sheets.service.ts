import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: any;
  private initialized = false;

  constructor(private configService: ConfigService) {
    this.initializeSheets();
  }

  private async initializeSheets() {
    try {
      const credentialsPath = this.configService.get<string>(
        'GOOGLE_SHEETS_CREDENTIALS_PATH',
      );

      if (!credentialsPath) {
        this.logger.warn(
          'GOOGLE_SHEETS_CREDENTIALS_PATH not configured, Google Sheets logging will be disabled',
        );
        return;
      }

      // Resolve path relative to project root
      const resolvedPath = path.isAbsolute(credentialsPath)
        ? credentialsPath
        : path.resolve(process.cwd(), credentialsPath);

      if (!fs.existsSync(resolvedPath)) {
        this.logger.warn(
          `Google credentials file not found at ${resolvedPath}, Google Sheets logging will be disabled`,
        );
        return;
      }

      const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      this.initialized = true;
      this.logger.log('Google Sheets API initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Google Sheets API', error);
      this.initialized = false;
    }
  }

  async logDealerCredentials(data: {
    dealerName: string;
    databaseName: string;
    username: string;
    password: string;
    createdDate: Date;
    status: string;
  }) {
    if (!this.initialized) {
      this.logger.warn(
        'Google Sheets not initialized, skipping credential logging',
      );
      return { success: false, error: 'Google Sheets not initialized' };
    }

    try {
      const spreadsheetId = this.configService.get<string>('GOOGLE_SHEET_ID');
      let sheetName =
        this.configService.get<string>('GOOGLE_SHEET_NAME') || 'Sheet1';

      if (!spreadsheetId) {
        this.logger.warn(
          'GOOGLE_SHEET_ID not configured, skipping credential logging',
        );
        return { success: false, error: 'GOOGLE_SHEET_ID not configured' };
      }

      // Quote sheet name if it contains special characters or spaces
      // Google Sheets requires single quotes around sheet names with special chars
      const needsQuotes = /[^a-zA-Z0-9_]/.test(sheetName);
      const quotedSheetName = needsQuotes ? `'${sheetName}'` : sheetName;

      // Try to get sheet info first to verify it exists
      try {
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId,
        });
        const sheetExists = spreadsheet.data.sheets?.some(
          (sheet: any) => sheet.properties.title === sheetName,
        );

        if (!sheetExists) {
          this.logger.warn(
            `Sheet "${sheetName}" not found. Available sheets: ${spreadsheet.data.sheets?.map((s: any) => s.properties.title).join(', ') || 'none'}`,
          );
          // Try using the first sheet as fallback
          if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
            sheetName = spreadsheet.data.sheets[0].properties.title;
            this.logger.log(`Using first available sheet: ${sheetName}`);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Could not verify sheet existence, proceeding anyway: ${err.message}`,
        );
      }

      const values = [
        [
          data.dealerName,
          data.databaseName,
          data.username,
          data.password,
          data.createdDate.toISOString(),
          data.status,
        ],
      ];

      // Use proper range format - quote sheet name if needed
      const finalSheetName = needsQuotes ? `'${sheetName}'` : sheetName;
      const range = `${finalSheetName}!A:F`;

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values },
      });

      this.logger.log(
        `Successfully logged dealer ${data.dealerName} credentials to Google Sheets`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to log to Google Sheets', error);
      // Don't throw - just log and return failure so dealer creation can continue
      return { success: false, error: error.message };
    }
  }
}
