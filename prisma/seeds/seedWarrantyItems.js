export async function seedWarrantyItems(prisma) {
  console.log("🛡️  Seeding warranty items...");
  const WARRANTY_ITEMS = [
    "Comprehensive mechanical and electrical coverage",
    "Full engine and transmission protection",
    "Turbocharger and fuel system components",
    "ABS, sensors and ECUs",
    "Hybrid and electric vehicle components",
    "Enhanced wear and tear coverage",
    "Highest labour contribution",
    "Core mechanical and electrical component cover",
    "Manual and automatic gearbox cover",
    "Engine internal components",
    "Cooling system components",
    "Essential electrical parts",
    "Wear and tear covered where listed",
    "Free MOT contribution up to £40",
    "Breakdown cover (subject to availability)",
  ];

  let created = 0;
  let skipped = 0;

  try {
    const existing = await prisma.warrantyItem.findMany({
      where: { type: "benefit", label: { in: WARRANTY_ITEMS } },
      select: { label: true },
    });
    const existingLabels = new Set(existing.map((i) => i.label));
    const toCreate = WARRANTY_ITEMS.filter(
      (label) => !existingLabels.has(label)
    );

    if (toCreate.length > 0) {
      await prisma.$transaction(
        toCreate.map((label) =>
          prisma.warrantyItem.create({
            data: { label, type: "benefit", status: "active" },
          })
        )
      );
      created = toCreate.length;
    }
    skipped = WARRANTY_ITEMS.length - created;
  } catch (error) {
    console.error("❌ Error seeding warranty items:", error.message);
  }

  console.log(`✅ Warranty Items: ${created} created, ${skipped} skipped`);
  return { created, skipped, total: WARRANTY_ITEMS.length };
}
