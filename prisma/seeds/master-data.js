// const { PrismaClient } = require('../../src/generated/prisma');

async function seedDepartments(prisma) {
  console.log('🏢 Seeding departments...');
  const departments = [
    'Administration',
    'Human Resources',
    'Finance',
    'Sales',
    'Marketing',
    'IT Support',
    'Engineering',
    'Operations',
    'Customer Support',
    'Legal',
    'Research and Development',
  ];

  let created = 0;
  for (const name of departments) {
    const exists = await prisma.department.findFirst({ where: { name } });
    if (!exists) {
      await prisma.department.create({
        data: { name, status: 'active' },
      });
      created++;
    }
  }
  console.log(`✓ Departments: ${created} created`);
}

async function seedDesignations(prisma) {
  console.log('👨‍💼 Seeding designations...');
  const designations = [
    'CEO',
    'CTO',
    'CFO',
    'Manager',
    'Team Lead',
    'Senior Developer',
    'Junior Developer',
    'HR Executive',
    'Sales Executive',
    'Support Specialist',
    'Accountant',
    'Intern',
  ];

  let created = 0;
  for (const name of designations) {
    const exists = await prisma.designation.findFirst({ where: { title: name } });
    if (!exists) {
      await prisma.designation.create({
        data: { title: name, status: 'active' },
      });
      created++;
    }
  }
  console.log(`✓ Designations: ${created} created`);
}

async function seedJobTypes(prisma) {
  console.log('💼 Seeding job types...');
  const jobTypes = [
    'Permanent',
    'Contract',
    'Probation',
    'Internship',
    'Part Time',
    'Remote',
  ];

  let created = 0;
  for (const name of jobTypes) {
    const exists = await prisma.jobType.findFirst({ where: { title: name } });
    if (!exists) {
      await prisma.jobType.create({
        data: { title: name, status: 'active' },
      });
      created++;
    }
  }
  console.log(`✓ Job Types: ${created} created`);
}

async function seedMaritalStatuses(prisma) {
  console.log('💍 Seeding marital statuses...');
  const statuses = ['Single', 'Married', 'Divorced', 'Widowed'];

  let created = 0;
  for (const name of statuses) {
    const exists = await prisma.maritalStatus.findFirst({ where: { name } });
    if (!exists) {
      await prisma.maritalStatus.create({
        data: { name, status: 'active' },
      });
      created++;
    }
  }
  console.log(`✓ Marital Statuses: ${created} created`);
}

async function seedSubDepartments(prisma) {
  console.log('📂 Seeding sub-departments...');
  
  // Map of Department Name -> Sub Department Names
  const subDepsCheck = {
    'Human Resources': ['Recruitment', 'Payroll', 'Employee Relations'],
    'Finance': ['Accounts Payable', 'Accounts Receivable', 'Taxation'],
    'IT Support': ['Network Administration', 'Hardware Support', 'Software Support'],
    'Sales': ['Inbound Sales', 'Outbound Sales'],
    'Marketing': ['Digital Marketing', 'Content Creating', 'SEO'],
  };

  let created = 0;
  
  for (const [depName, subDepNames] of Object.entries(subDepsCheck)) {
    const department = await prisma.department.findFirst({ where: { name: depName } });
    if (!department) continue;
    
    for (const name of subDepNames) {
      const exists = await prisma.subDepartment.findFirst({ 
        where: { name, departmentId: department.id } 
      });
      
      if (!exists) {
        await prisma.subDepartment.create({
          data: {
            name,
            departmentId: department.id,
            status: 'active'
          }
        });
        created++;
      }
    }
  }
  console.log(`✓ Sub-Departments: ${created} created`);
}

module.exports = {
  seedDepartments,
  seedDesignations,
  seedJobTypes,
  seedMaritalStatuses,
  seedSubDepartments,
};
