import { PrismaClient, LeadStatus } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedProperty {
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  zoning: string | null;
  scrapeSource: string;
  status: LeadStatus;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  aiNotes?: string;
}

const properties: SeedProperty[] = [
  {
    address: "1420 NW 12th Ave",
    city: "Miami",
    state: "FL",
    zip: "33136",
    propertyType: "Multi-Family",
    zoning: "T6-8",
    scrapeSource: "county-records",
    status: LeadStatus.QUALIFIED,
    ownerName: "Hernandez Holdings LLC",
    ownerPhone: "(305) 555-0142",
    ownerEmail: "ops@hernandezholdings.example",
    aiNotes: "Owner open to off-market sale, asked for a written offer by EOW.",
  },
  {
    address: "8801 Gandy Blvd N",
    city: "Tampa",
    state: "FL",
    zip: "33702",
    propertyType: "Land",
    zoning: "CG",
    scrapeSource: "mls-expired",
    status: LeadStatus.AI_CONTACTED,
    ownerName: "Gulfside Land Trust",
    ownerPhone: "(813) 555-0199",
    ownerEmail: "trustee@gulfside.example",
    aiNotes: "Replied to first SMS; gauging timeline before routing to qualification.",
  },
  {
    address: "455 Coconut Row",
    city: "Palm Beach",
    state: "FL",
    zip: "33480",
    propertyType: "Single-Family",
    zoning: "R-B",
    scrapeSource: "probate-list",
    status: LeadStatus.SKIP_TRACED,
    ownerName: "Estate of M. Carter",
    ownerPhone: "(561) 555-0177",
    ownerEmail: "",
  },
  {
    address: "2100 S Orange Ave",
    city: "Orlando",
    state: "FL",
    zip: "32806",
    propertyType: "Multi-Family",
    zoning: "MU-1",
    scrapeSource: "county-records",
    status: LeadStatus.COLD,
    ownerName: "Sunbelt Capital Partners",
    ownerPhone: "(407) 555-0110",
    ownerEmail: "im@sunbeltcap.example",
    aiNotes: "Not selling for 24+ months. Re-touch Q3.",
  },
  {
    address: "612 NE 1st St",
    city: "Fort Lauderdale",
    state: "FL",
    zip: "33301",
    propertyType: "Land",
    zoning: "RAC",
    scrapeSource: "tax-delinquent",
    status: LeadStatus.RAW,
  },
  {
    address: "3409 Bee Cave Rd",
    city: "Austin",
    state: "TX",
    zip: "78746",
    propertyType: "Land",
    zoning: "GR",
    scrapeSource: "mls-expired",
    status: LeadStatus.RAW,
  },
  {
    address: "77 Riverwalk Dr",
    city: "San Antonio",
    state: "TX",
    zip: "78205",
    propertyType: "Multi-Family",
    zoning: "MF-33",
    scrapeSource: "county-records",
    status: LeadStatus.SKIP_TRACED,
    ownerName: "Alamo Equity Group",
    ownerPhone: "(210) 555-0188",
    ownerEmail: "deals@alamoequity.example",
  },
  {
    address: "1900 Biscayne Blvd",
    city: "Miami",
    state: "FL",
    zip: "33132",
    propertyType: "Land",
    zoning: "T6-12",
    scrapeSource: "probate-list",
    status: LeadStatus.QUALIFIED,
    ownerName: "Biscayne Infill Ventures",
    ownerPhone: "(305) 555-0163",
    ownerEmail: "principal@biscayneinfill.example",
    aiNotes: "Verbally agreed to $1.6M; sending LOI.",
  },
];

async function main(): Promise<void> {
  console.log("Seeding properties…");
  for (const p of properties) {
    await prisma.property.upsert({
      where: {
        property_location: {
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip,
        },
      },
      update: {
        status: p.status,
        ownerName: p.ownerName ?? null,
        ownerPhone: p.ownerPhone ?? null,
        ownerEmail: p.ownerEmail ?? null,
        aiNotes: p.aiNotes ?? null,
      },
      create: {
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        propertyType: p.propertyType,
        zoning: p.zoning ?? null,
        scrapeSource: p.scrapeSource,
        status: p.status,
        ownerName: p.ownerName ?? null,
        ownerPhone: p.ownerPhone ?? null,
        ownerEmail: p.ownerEmail ?? null,
        aiNotes: p.aiNotes ?? null,
      },
    });
  }

  console.log("Seeding list packages…");
  const flLand = await prisma.property.findMany({
    where: { state: "FL", propertyType: "Land" },
    select: { id: true },
  });
  const flMulti = await prisma.property.findMany({
    where: { state: "FL", propertyType: "Multi-Family" },
    select: { id: true },
  });

  await prisma.listPackage.create({
    data: {
      name: "Florida Commercial Infill Land",
      description:
        "Skip-traced, owner-verified infill land parcels across Miami, Tampa, Orlando and Fort Lauderdale.",
      price: 1450,
      properties: { connect: flLand.map((r) => ({ id: r.id })) },
    },
  });

  await prisma.listPackage.create({
    data: {
      name: "FL Distressed Multi-Family",
      description:
        "Multi-family targets sourced from probate and county records with motivated-seller signals.",
      price: 1950,
      properties: { connect: flMulti.map((r) => ({ id: r.id })) },
    },
  });

  const total = await prisma.property.count();
  const packages = await prisma.listPackage.count();
  console.log(`Done. ${total} properties, ${packages} list packages.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
