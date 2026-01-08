try {
    console.log("Loading dotenv...");
    require("dotenv").config();
    console.log("Loading PrismaClient...");
    const { PrismaClient } = require("../../src/generated/prisma");
    console.log("Instantiating PrismaClient...");
    // Pass empty object to satisfy constructor validation
    const prisma = new PrismaClient({});
    console.log("PrismaClient instantiated.");
    
    console.log("Loading pg...");
    const { Pool } = require("pg");
    console.log("pg loaded.");

    console.log("Loading path...");
    const path = require("path");
    console.log("Loading tenantSchemaGenerator...");
    const { generateTenantSchema } = require("./tenantSchemaGenerator");
    console.log("Dependencies loaded successfully.");

    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is missing.");
    } else {
        console.log("DATABASE_URL is present.");
    }

} catch (e) {
    console.error("Error loading dependencies:", e);
}
