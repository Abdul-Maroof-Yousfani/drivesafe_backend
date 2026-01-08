require("dotenv").config();
const { PrismaClient } = require("../../src/generated/prisma");
const { Pool } = require("pg");
const { execFile } = require("child_process");
const { promisify } = require("util");
const path = require("path");
const { generateTenantSchema } = require("./tenantSchemaGenerator");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    dryRun: false,
    dealerId: null,
  };

  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--dealerId="))
      args.dealerId = a.split("=")[1] || null;
  }

  return args;
}

async function ensurePgCrypto(connectionString) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function prismaDbPushTenantSchema({ connectionString }) {
  // Path to prisma/tenant-schema
  const tenantSchemaPath = path.resolve(
    process.cwd(),
    "prisma",
    "tenant-schema"
  );
  const execFileAsync = promisify(execFile);
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

  // Prisma 7 no longer supports --skip-generate for db push
  const args = [
    "prisma",
    "db",
    "push",
    "--schema",
    tenantSchemaPath,
    "--accept-data-loss",
  ];

  await execFileAsync(npxCmd, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
    },
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function main() {
  const { dryRun, dealerId } = parseArgs(process.argv);

  // Regenerate tenant schema from prisma/schema/*.prisma once per run
  await generateTenantSchema({ repoRoot: process.cwd() });

  const where = dealerId ? { dealerId } : {};
  const mappings = await prisma.tenantDatabaseMapping.findMany({
    where,
    select: {
      id: true,
      dealerId: true,
      databaseName: true,
      databaseUrl: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (mappings.length === 0) {
    console.log(
      dealerId
        ? `No tenant databases found for dealerId=${dealerId}`
        : "No tenant databases found."
    );
    return;
  }

  console.log(
    `Found ${mappings.length} tenant database(s)${
      dealerId ? ` for dealerId=${dealerId}` : ""
    }.`
  );

  if (dryRun) {
    console.log("Dry run enabled. No changes will be applied.\n");
    for (const m of mappings) {
      console.log(
        `- dealerId=${m.dealerId} db=${m.databaseName} status=${m.status}`
      );
    }
    return;
  }

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const m of mappings) {
    const label = `dealerId=${m.dealerId} db=${m.databaseName}`;
    try {
      if (!m.databaseUrl)
        throw new Error("databaseUrl is missing in TenantDatabaseMapping");
      console.log(`\nSyncing schema for ${label} ...`);
      await ensurePgCrypto(m.databaseUrl);
      await prismaDbPushTenantSchema({ connectionString: m.databaseUrl });
      ok += 1;
      console.log(`✅ Synced ${label}`);
    } catch (e) {
      failed += 1;
      failures.push({ ...m, error: e?.message || String(e) });
      console.error(`❌ Failed ${label}: ${e?.message || e}`);
      // continue syncing remaining tenants
    }
  }

  console.log(`\nDone. Success=${ok} Failed=${failed}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(
        `- dealerId=${f.dealerId} db=${f.databaseName} status=${f.status} error=${f.error}`
      );
    }
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("Fatal error syncing tenant schemas:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
