const fs = require('fs/promises');
const path = require('path');

const EXCLUDED_MODELS = new Set([
  // master/auth-only
  "User",
  "Role",
  "Permission",
  "RolePermission",
  "Session",
  "RefreshToken",
  "ActivityLog",
  "LoginHistory",
  "BlacklistedToken",
  // master-only business
  "TenantDatabaseMapping",
]);

function extractModelBlocks(schemaText) {
  // matches: model Name { ... }
  const regex = /model\s+([A-Za-z0-9_]+)\s*\{[\s\S]*?\n\}/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(schemaText)) !== null) {
    blocks.push({ name: match[1], block: match[0] });
  }
  return blocks;
}

function stripMasterOnlyRelations(modelBlock) {
  // Remove relation fields that point to excluded models like User/Dealer/TenantDatabaseMapping.
  // Keep scalar ids like createdById/dealerId/userId.
  const lines = modelBlock.split("\n");
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Keep braces always
    if (trimmed === "{" || trimmed === "}") {
      cleaned.push(line);
      continue;
    }

    // Skip relation fields that reference excluded models
    if (/\s(User|TenantDatabaseMapping|Role|Permission|Session|RefreshToken|ActivityLog|LoginHistory|BlacklistedToken)\b/.test(
      trimmed
    )) {
      // If it's clearly a scalar id field, keep it (e.g. userId String?)
      if (/^\w+Id\s+\w+/.test(trimmed)) {
        cleaned.push(line);
      }
      continue;
    }

    cleaned.push(line);
  }

  return cleaned.join("\n");
}

async function generateTenantSchema({ repoRoot }) {
  const prismaSchemaDir = path.join(repoRoot, "prisma", "schema");
  const tenantSchemaDir = path.join(repoRoot, "prisma", "tenant-schema");
  const outModelsFile = path.join(tenantSchemaDir, "models.prisma");

  // Read all existing schema fragments (single source of truth)
  const entries = await fs.readdir(prismaSchemaDir);
  const prismaFiles = entries
    .filter((f) => f.endsWith(".prisma"))
    // exclude base.prisma (tenant schema has its own base.prisma)
    .filter((f) => f !== "base.prisma");

  const allBlocks = [];
  for (const file of prismaFiles) {
    const fullPath = path.join(prismaSchemaDir, file);
    const content = await fs.readFile(fullPath, "utf8");
    const blocks = extractModelBlocks(content);
    allBlocks.push(...blocks);
  }

  const kept = [];
  const seen = new Set();
  for (const { name, block } of allBlocks) {
    if (EXCLUDED_MODELS.has(name)) continue;
    if (seen.has(name)) continue; // avoid duplicates across files
    seen.add(name);
    kept.push(stripMasterOnlyRelations(block));
  }

  const header = `// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY
// Generated from prisma/schema/*.prisma (single source of truth)
// This is the tenant (dealer) database schema: it excludes master/auth models (User/Dealer/etc.)
// and strips relation fields pointing to those excluded models.

`;

  await fs.mkdir(tenantSchemaDir, { recursive: true });
  await fs.writeFile(outModelsFile, header + kept.join("\n\n") + "\n", "utf8");

  return { outModelsFile, modelCount: kept.length };
}

module.exports = { generateTenantSchema };

// Allow running as a script: `node prisma/scripts/tenantSchemaGenerator.js`
if (require.main === module) {
  (async () => {
    const repoRoot = process.cwd();
    const { outModelsFile, modelCount } = await generateTenantSchema({ repoRoot });
    // eslint-disable-next-line no-console
    console.log(
      `Tenant schema generated: ${outModelsFile} (${modelCount} models)`,
    );
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to generate tenant schema:', err);
    process.exitCode = 1;
  });
}