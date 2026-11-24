import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertDemoDataEnabled, DemoDataError, seedDemoData } from "../src/lib/server/demo-data";

async function main() {
  const environment = {
    DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
    DEMO_SEED_DATA: process.env.DEMO_SEED_DATA,
    DEMO_BUYER_PASSWORD: process.env.DEMO_BUYER_PASSWORD,
    DEMO_SELLER_PASSWORD: process.env.DEMO_SELLER_PASSWORD,
    DEMO_TEST_ADMIN_PASSWORD: process.env.DEMO_TEST_ADMIN_PASSWORD
  };
  assertDemoDataEnabled(environment);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new DemoDataError("DATABASE_URL is required. Apply migrations and run demo:bootstrap before adding sample data.");
  }

  // Use only the explicitly selected host/process environment. A developer's
  // .env.local must never override the database chosen for this demo operation.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await seedDemoData(prisma, environment);
    const counts = Object.entries(result.counts).map(([name, count]) => `${name}=${count}`).join(", ");
    console.log(`Demo sample data ${result.status}: ${counts || "recordsCreated=0"}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print only fixed validation text. Raw database errors may contain private
  // connection details, input values, or password hashes.
  if (error instanceof DemoDataError) {
    console.error(`Demo sample data failed: ${error.message}`);
  } else {
    console.error("Demo sample data failed. Check database connectivity, migrations, and permissions. The transaction did not overwrite existing data.");
  }
  process.exitCode = 1;
});
