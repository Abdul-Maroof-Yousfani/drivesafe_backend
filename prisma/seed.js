// 1. Load env vars first
require('dotenv').config();
const fs = require('fs');

// 2. Then import Prisma and other libraries
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const { seedWarrantyItems } = require('./seeds/warranty-items');

// 3. Initialize
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");
  // Quick connection check with a clearer error than Prisma's long stack
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    const msg = e?.message || String(e);
    if (e?.code === "P1003") {
      throw new Error(
        `Database does not exist for DATABASE_URL. Please create the database (or fix DATABASE_URL) then re-run seed. Details: ${msg}`
      );
    }
    throw e;
  }

  // Create permissions
  const permissionsList = [
    // Users
    {
      name: "users.view",
      module: "users",
      action: "view",
      description: "View users",
    },
    {
      name: "users.create",
      module: "users",
      action: "create",
      description: "Create users",
    },
    {
      name: "users.update",
      module: "users",
      action: "update",
      description: "Update users",
    },
    {
      name: "users.delete",
      module: "users",
      action: "delete",
      description: "Delete users",
    },
    // Roles
    {
      name: "roles.view",
      module: "roles",
      action: "view",
      description: "View roles",
    },
    {
      name: "roles.create",
      module: "roles",
      action: "create",
      description: "Create roles",
    },
    {
      name: "roles.update",
      module: "roles",
      action: "update",
      description: "Update roles",
    },
    {
      name: "roles.delete",
      module: "roles",
      action: "delete",
      description: "Delete roles",
    },
    // Employees
    {
      name: "employees.view",
      module: "employees",
      action: "view",
      description: "View employees",
    },
    {
      name: "employees.create",
      module: "employees",
      action: "create",
      description: "Create employees",
    },
    {
      name: "employees.update",
      module: "employees",
      action: "update",
      description: "Update employees",
    },
    {
      name: "employees.delete",
      module: "employees",
      action: "delete",
      description: "Delete employees",
    },
    // Departments
    {
      name: "departments.view",
      module: "departments",
      action: "view",
      description: "View departments",
    },
    {
      name: "departments.create",
      module: "departments",
      action: "create",
      description: "Create departments",
    },
    {
      name: "departments.update",
      module: "departments",
      action: "update",
      description: "Update departments",
    },
    {
      name: "departments.delete",
      module: "departments",
      action: "delete",
      description: "Delete departments",
    },
    // Attendance
    {
      name: "attendance.view",
      module: "attendance",
      action: "view",
      description: "View attendance",
    },
    {
      name: "attendance.create",
      module: "attendance",
      action: "create",
      description: "Create attendance",
    },
    {
      name: "attendance.update",
      module: "attendance",
      action: "update",
      description: "Update attendance",
    },
    {
      name: "attendance.delete",
      module: "attendance",
      action: "delete",
      description: "Delete attendance",
    },
    // Leaves
    {
      name: "leaves.view",
      module: "leaves",
      action: "view",
      description: "View leaves",
    },
    {
      name: "leaves.create",
      module: "leaves",
      action: "create",
      description: "Create leaves",
    },
    {
      name: "leaves.update",
      module: "leaves",
      action: "update",
      description: "Update leaves",
    },
    {
      name: "leaves.delete",
      module: "leaves",
      action: "delete",
      description: "Delete leaves",
    },
    {
      name: "leaves.approve",
      module: "leaves",
      action: "approve",
      description: "Approve leaves",
    },
    // Payroll
    {
      name: "payroll.view",
      module: "payroll",
      action: "view",
      description: "View payroll",
    },
    {
      name: "payroll.create",
      module: "payroll",
      action: "create",
      description: "Create payroll",
    },
    {
      name: "payroll.update",
      module: "payroll",
      action: "update",
      description: "Update payroll",
    },
    {
      name: "payroll.delete",
      module: "payroll",
      action: "delete",
      description: "Delete payroll",
    },
    {
      name: "payroll.process",
      module: "payroll",
      action: "process",
      description: "Process payroll",
    },
    // Master Data
    {
      name: "master.view",
      module: "master",
      action: "view",
      description: "View master data",
    },
    {
      name: "master.create",
      module: "master",
      action: "create",
      description: "Create master data",
    },
    {
      name: "master.update",
      module: "master",
      action: "update",
      description: "Update master data",
    },
    {
      name: "master.delete",
      module: "master",
      action: "delete",
      description: "Delete master data",
    },
    // Activity Logs
    {
      name: "activity_logs.view",
      module: "activity_logs",
      action: "view",
      description: "View activity logs",
    },
    // Settings
    {
      name: "settings.view",
      module: "settings",
      action: "view",
      description: "View settings",
    },
    {
      name: "settings.update",
      module: "settings",
      action: "update",
      description: "Update settings",
    },
    // Reports
    {
      name: "reports.view",
      module: "reports",
      action: "view",
      description: "View reports",
    },
    {
      name: "reports.export",
      module: "reports",
      action: "export",
      description: "Export reports",
    },
  ];

  console.log("📝 Creating permissions...");
  const permissions = [];
  for (const perm of permissionsList) {
    const permission = await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
    permissions.push(permission);
  }
  console.log(`✅ Created ${permissions.length} permissions`);

  // Create Admin Role with all permissions
  console.log("👑 Creating admin role...");
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
      description: "Administrator with full access",
      isSystem: true,
    },
  });

  // Assign all permissions to admin role
  console.log("🔗 Assigning permissions to admin role...");
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Create HR Role
  console.log("👤 Creating HR role...");
  const hrRole = await prisma.role.upsert({
    where: { name: "hr" },
    update: {},
    create: {
      name: "hr",
      description: "HR Manager",
      isSystem: true,
    },
  });

  const hrPermissions = permissions.filter((p) =>
    ["employees", "departments", "attendance", "leaves"].includes(p.module)
  );
  for (const permission of hrPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: hrRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: hrRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Create Employee Role
  console.log("👤 Creating employee role...");
  const employeeRole = await prisma.role.upsert({
    where: { name: "employee" },
    update: {},
    create: {
      name: "employee",
      description: "Regular Employee",
      isSystem: true,
    },
  });

  const employeePermissions = permissions.filter(
    (p) =>
      p.name === "attendance.view" ||
      p.name === "leaves.view" ||
      p.name === "leaves.create"
  );
  for (const permission of employeePermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: employeeRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: employeeRole.id,
        permissionId: permission.id,
      },
    });
  }

  // Create Admin User
  console.log("👤 Creating admin user...");
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@drivesafe.com" },
    update: {
      password: hashedPassword,
      roleId: adminRole.id,
    },
    create: {
      email: "admin@drivesafe.com",
      password: hashedPassword,
      firstName: "System",
      lastName: "Admin",
      phone: "0300-0000000",
      status: "active",
      roleId: adminRole.id,
    },
  });

  // Seed countries
  // await seedCountries(prisma);

  // Seed states and cities (must be after countries)
  // await seedCities(prisma);

  // Seed institutes
  // await seedInstitutes(prisma);

  // Seed departments
  // await seedDepartments(prisma);

  // Seed sub-departments (must be after departments)
  // await seedSubDepartments(prisma);

  // Seed designations
  // await seedDesignations(prisma);

  // Seed job types
  // await seedJobTypes(prisma);

  // Seed marital statuses
  // await seedMaritalStatuses(prisma);

  // Seed warranty items
  await seedWarrantyItems(prisma);

  // Seed remaining master data (as per prisma/schema/master.prisma)
  console.log("📦 Seeding additional master data...");

  // Degree Types
  // const degreeTypes = [
  //   "Matric",
  //   "Intermediate",
  //   "Bachelors",
  //   "Masters",
  //   "MPhil",
  //   "PhD",
  // ];
  // for (const name of degreeTypes) {
  //   await upsertByUnique(prisma.degreeType, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Allowance Heads
  // const allowanceHeads = [
  //   "Basic",
  //   "House Rent",
  //   "Medical",
  //   "Conveyance",
  //   "Fuel",
  //   "Mobile",
  //   "Bonus",
  // ];
  // for (const name of allowanceHeads) {
  //   await upsertByUnique(prisma.allowanceHead, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Deduction Heads
  // const deductionHeads = [
  //   "Tax",
  //   "EOBI",
  //   "Provident Fund",
  //   "Late Deduction",
  //   "Loan Deduction",
  // ];
  // for (const name of deductionHeads) {
  //   await upsertByUnique(prisma.deductionHead, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Loan Types
  // const loanTypes = [
  //   "Advance Salary",
  //   "Personal Loan",
  //   "Vehicle Loan",
  //   "Emergency Loan",
  // ];
  // for (const name of loanTypes) {
  //   await upsertByUnique(prisma.loanType, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Leave Types
  // const leaveTypes = [
  //   "Casual Leave",
  //   "Sick Leave",
  //   "Annual Leave",
  //   "Maternity Leave",
  //   "Paternity Leave",
  // ];
  // for (const name of leaveTypes) {
  //   await upsertByUnique(prisma.leaveType, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // // Leaves Policies
  // const leavesPolicies = [
  //   {
  //     name: "Default Leave Policy",
  //     details: "Standard annual leave policy",
  //     policyDateFrom: new Date(new Date().getFullYear(), 0, 1),
  //     policyDateTill: new Date(new Date().getFullYear(), 11, 31),
  //     fullDayDeductionRate: new Prisma.Decimal("0"),
  //     halfDayDeductionRate: new Prisma.Decimal("0"),
  //     shortLeaveDeductionRate: new Prisma.Decimal("0"),
  //     status: "active",
  //   },
  // ];

  // const createdPolicies = [];
  // for (const p of leavesPolicies) {
  //   const policy = await prisma.leavesPolicy.upsert({
  //     where: { name: p.name },
  //     update: {},
  //     create: p,
  //   });
  //   createdPolicies.push(policy);
  // }

  // LeavesPolicyLeaveType (junction)
  // const allLeaveTypes = await prisma.leaveType.findMany();
  // for (const policy of createdPolicies) {
  //   for (const lt of allLeaveTypes) {
  //     await prisma.leavesPolicyLeaveType.upsert({
  //       where: {
  //         leavesPolicyId_leaveTypeId: {
  //           leavesPolicyId: policy.id,
  //           leaveTypeId: lt.id,
  //         },
  //       },
  //       update: {},
  //       create: {
  //         leavesPolicyId: policy.id,
  //         leaveTypeId: lt.id,
  //         numberOfLeaves: lt.name === "Annual Leave" ? 14 : 8,
  //       },
  //     });
  //   }
  // }

  // Equipment
  // const equipments = [
  //   "Laptop",
  //   "Desktop",
  //   "ID Card",
  //   "Sim Card",
  //   "Company Mobile",
  //   "Vehicle",
  // ];
  // for (const name of equipments) {
  //   await upsertByUnique(prisma.equipment, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Salary Breakups
  // const salaryBreakups = [
  //   {
  //     name: "Default Salary Breakup",
  //     details: "Basic + Allowances - Deductions",
  //     status: "active",
  //   },
  // ];
  // for (const sb of salaryBreakups) {
  //   await prisma.salaryBreakup.upsert({
  //     where: { name: sb.name },
  //     update: {},
  //     create: sb,
  //   });
  // }

  // Tax Slabs (no unique key) -> create if not exists by (name, minAmount, maxAmount, rate)
  // const taxSlabs = [
  //   {
  //     name: "Slab A",
  //     minAmount: "0",
  //     maxAmount: "600000",
  //     rate: "0.00",
  //     status: "active",
  //   },
  //   {
  //     name: "Slab B",
  //     minAmount: "600001",
  //     maxAmount: "1200000",
  //     rate: "0.05",
  //     status: "active",
  //   },
  //   {
  //     name: "Slab C",
  //     minAmount: "1200001",
  //     maxAmount: "2400000",
  //     rate: "0.10",
  //     status: "active",
  //   },
  // ];
  // for (const slab of taxSlabs) {
  //   const exists = await prisma.taxSlab.findFirst({
  //     where: {
  //       name: slab.name,
  //       minAmount: new Prisma.Decimal(slab.minAmount),
  //       maxAmount: new Prisma.Decimal(slab.maxAmount),
  //       rate: new Prisma.Decimal(slab.rate),
  //     },
  //   });
  //   if (!exists) {
  //     await prisma.taxSlab.create({
  //       data: {
  //         name: slab.name,
  //         minAmount: new Prisma.Decimal(slab.minAmount),
  //         maxAmount: new Prisma.Decimal(slab.maxAmount),
  //         rate: new Prisma.Decimal(slab.rate),
  //         status: slab.status,
  //       },
  //     });
  //   }
  // }

  // Bonus Types
  // const bonusTypes = ["Eid Bonus", "Performance Bonus", "Annual Bonus"];
  // for (const name of bonusTypes) {
  //   await upsertByUnique(prisma.bonusType, "name", name, {
  //     name,
  //     status: "active",
  //   });
  // }

  // Approval Settings (no unique) -> create if missing by name
  // const approvalSettings = [
  //   {
  //     name: "Leaves Approval",
  //     levels: 2,
  //     details: "Line Manager -> HR",
  //     status: "active",
  //   },
  //   {
  //     name: "Payroll Approval",
  //     levels: 2,
  //     details: "Finance -> Admin",
  //     status: "active",
  //   },
  // ];
  // for (const a of approvalSettings) {
  //   const exists = await prisma.approvalSetting.findFirst({
  //     where: { name: a.name },
  //   });
  //   if (!exists) {
  //     await prisma.approvalSetting.create({ data: a });
  //   }
  // }

  // Employee Grades
  // const employeeGrades = ["A", "B", "C", "D", "E"];
  // for (const grade of employeeGrades) {
  //   await upsertByUnique(prisma.employeeGrade, "grade", grade, {
  //     grade,
  //     status: "active",
  //   });
  // }

  // Employee Statuses
  // const employeeStatuses = [
  //   { status: "Active", statusType: "active" },
  //   { status: "On Probation", statusType: "active" },
  //   { status: "Resigned", statusType: "inactive" },
  //   { status: "Terminated", statusType: "inactive" },
  // ];
  // for (const es of employeeStatuses) {
  //   await prisma.employeeStatus.upsert({
  //     where: { status: es.status },
  //     update: {},
  //     create: es,
  //   });
  // }

  // Provident Funds
  // const providentFunds = [
  //   {
  //     name: "Default Provident Fund",
  //     percentage: new Prisma.Decimal("0.08"),
  //     status: "active",
  //   },
  // ];
  // for (const pf of providentFunds) {
  //   await prisma.providentFund.upsert({
  //     where: { name: pf.name },
  //     update: {},
  //     create: pf,
  //   });
  // }

  // Working Hours Policies
  // const workingHoursPolicies = [
  //   {
  //     name: "Default 9 to 6",
  //     startWorkingHours: "09:00",
  //     endWorkingHours: "18:00",
  //     shortDayMins: 240,
  //     startBreakTime: "13:00",
  //     endBreakTime: "14:00",
  //     status: "active",
  //   },
  //   {
  //     name: "Default 10 to 7",
  //     startWorkingHours: "10:00",
  //     endWorkingHours: "19:00",
  //     shortDayMins: 240,
  //     startBreakTime: "13:30",
  //     endBreakTime: "14:30",
  //     status: "active",
  //   },
  // ];
  // for (const wh of workingHoursPolicies) {
  //   await prisma.workingHoursPolicy.upsert({
  //     where: { name: wh.name },
  //     update: {},
  //     create: wh,
  //   });
  // }

  // Branches (optional cityId, seed a few generic ones)
  // const branches = [
  //   { name: "Head Office", address: "Main Office", status: "active" },
  //   { name: "Branch Lahore", address: "Lahore", status: "active" },
  //   { name: "Branch Karachi", address: "Karachi", status: "active" },
  // ];
  // for (const b of branches) {
  //   await prisma.branch.upsert({
  //     where: { name: b.name },
  //     update: {},
  //     create: b,
  //   });
  // }

  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log("✅ Database seeded successfully!");
  console.log("═══════════════════════════════════════════");
  console.log("");
  console.log("🔐 Admin Login Credentials:");
  console.log("   Email:    admin@drivesafe.com");
  console.log("   Password: admin123");
  console.log("");
  console.log("⚠️  Please change the password after first login!");
  console.log("═══════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error('❌ Seed failed!', e);
    const errorInfo = {
      message: e.message,
      stack: e.stack,
      code: e.code,
      clientVersion: e.clientVersion
    };
    fs.writeFileSync('seed-error.log', JSON.stringify(errorInfo, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
