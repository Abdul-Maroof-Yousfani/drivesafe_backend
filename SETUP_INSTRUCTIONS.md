# Setup Instructions for Google Sheets Integration & Restricted DB Users

## Prerequisites

1. **PostgreSQL Database** - Ensure you have PostgreSQL installed and running
2. **Google Cloud Project** - You'll need a Google Cloud account to set up the service account

## Step 1: Master Database User

The system will automatically use the database user from your `DATABASE_URL` as the master user that owns all dealer databases.

**No additional setup needed!** The username will be extracted from your existing `DATABASE_URL`.

If you want to use a different user as the master (optional), you can set:

```env
# Optional: Override master user (defaults to username from DATABASE_URL)
DB_MASTER_USER=your_master_user
```

## Step 2: Update Environment Variables

Add the following to your `.env` file (if not already set):

# Google Sheets Configuration

GOOGLE_SHEETS_CREDENTIALS_PATH=./config/google-credentials.json
GOOGLE_SHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Sheet1

```

## Step 3: Set Up Google Sheets Integration

### 3.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"**
3. Name: `DriveSafe Dealer Tracking`
4. Click **Create**

### 3.2 Enable Google Sheets API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **"Google Sheets API"**
3. Click **Enable**

### 3.3 Create Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Name: `drivesafe-sheets-logger`
4. Click **Create and Continue**
5. Skip role assignment (click **Continue**)
6. Click **Done**

### 3.4 Generate Credentials JSON

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create New Key**
4. Choose **JSON** format
5. Click **Create**
6. Save the downloaded JSON file as `google-credentials.json`
7. Place it in `drivesafe/config/google-credentials.json`

### 3.5 Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create new spreadsheet
3. Name it: `Dealer Database Tracking`
4. Add headers in first row:
   - A1: `Dealer Name`
   - B1: `Database Name`
   - C1: `Username`
   - D1: `Password`
   - E1: `Created Date`
   - F1: `Status`

### 3.6 Share Sheet with Service Account

1. Open the service account JSON file
2. Copy the `client_email` value (looks like: `drivesafe-sheets-logger@project-id.iam.gserviceaccount.com`)
3. In Google Sheet, click **Share**
4. Paste the service account email
5. Give **Editor** permission
6. Uncheck **Notify people**
7. Click **Share**

### 3.7 Get Sheet ID

From the Google Sheet URL:
```

https://docs.google.com/spreadsheets/d/1ABC123xyz456/edit
^^^^^^^^^^^^^^^^
This is the Sheet ID

````

Copy the Sheet ID and add it to your `.env` file as `GOOGLE_SHEET_ID`.

## Step 4: Update Prisma Schema

After updating the Prisma schema, you need to generate the Prisma client:

```bash
cd drivesafe
npx prisma generate
````

If you need to apply the schema changes to the database:

```bash
npx prisma migrate dev
# or
npx prisma db push
```

## Step 5: Test the Implementation

1. Create a new dealer through the API
2. Verify that:
   - Database is created under the master user
   - Restricted user is created with proper permissions
   - Credentials are logged to Google Sheets
   - All rollback mechanisms work correctly

## Troubleshooting

### Google Sheets Not Logging

- Check that `GOOGLE_SHEETS_CREDENTIALS_PATH` points to the correct file
- Verify the service account email has Editor access to the sheet
- Check that `GOOGLE_SHEET_ID` is correct
- Review application logs for detailed error messages

### Database User Creation Fails

- Ensure the master user exists and has CREATEDB privilege
- Check PostgreSQL logs for detailed error messages
- Verify database connection string is correct

### Prisma Schema Errors

- Run `npx prisma generate` after schema changes
- Ensure all Prisma migrations are up to date

## Security Notes

⚠️ **Important Security Considerations:**

1. **Password Storage**: Database passwords are stored in plain text in the Dealer table. Consider encrypting them at rest.
2. **Google Credentials**: Never commit `google-credentials.json` to version control. It's already added to `.gitignore`.
3. **Master User Password**: Store the master user password securely and never expose it in logs or error messages.
4. **Environment Variables**: Keep `.env` files secure and never commit them to version control.

## Migration for Existing Dealers

Existing dealers will continue to work with their current setup. Only new dealers created after this implementation will get the restricted user setup. If you want to migrate existing dealers, you can create a migration script using the `createRestrictedUser` method.
