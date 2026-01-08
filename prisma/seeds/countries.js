// const { PrismaClient } = require('../../src/generated/prisma');
const fs = require('fs');
const path = require('path');

async function seedCountries(prisma) {
  console.log('🌍 Seeding countries...');
  const countriesPath = path.join(process.cwd(), 'countries.json');
  let countriesData = [];
  try {
      countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));
  } catch (error) {
      console.warn('⚠️ countries.json not found or invalid, skipping countries seed');
      return { created: 0, updated: 0, total: 0 };
  }
  
  let created = 0;
  let updated = 0;
  
  for (const item of countriesData) {
    const countryName = item.name?.trim();
    const countryIso = item.iso?.trim();
    
    if (!countryName || !countryIso) continue;
    
    const phoneCode = item.phonecode ? parseInt(item.phonecode, 10) : null;
    const numcode = item.numcode ? parseInt(item.numcode, 10) : null;
    
    if (phoneCode === null || isNaN(phoneCode) || numcode === null || isNaN(numcode)) {
      console.warn(`⚠️  Skipping ${countryName}: invalid phoneCode or numcode`);
      continue;
    }
    
    const existing = await prisma.country.findFirst({
      where: { iso: countryIso },
    });
    
    if (existing) {
      await prisma.country.update({
        where: { id: existing.id },
        data: {
          name: countryName,
          iso: countryIso,
          nicename: item.nicename?.trim() || countryName,
          iso3: item.iso3?.trim() || '',
          phoneCode: phoneCode,
          numcode: numcode,
        },
      });
      updated++;
    } else {
      await prisma.country.create({
        data: {
          name: countryName,
          iso: countryIso,
          nicename: item.nicename?.trim() || countryName,
          iso3: item.iso3?.trim() || '',
          phoneCode: phoneCode,
          numcode: numcode,
        },
      });
      created++;
    }
  }
  
  console.log(`✓ ${created} countries created, ${updated} countries updated (total: ${countriesData.length})`);
  return { created, updated, total: countriesData.length };
}

module.exports = { seedCountries };
