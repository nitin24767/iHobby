import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  assertDemoDeployment,
  bootstrapDemo,
  DemoBootstrapError
} from "../src/lib/server/demo-bootstrap";

async function main() {
  const environment = {
    DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
    DEMO_ADMIN_EMAIL: process.env.DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_PASSWORD: process.env.DEMO_ADMIN_PASSWORD,
    DEMO_ADMIN_NAME: process.env.DEMO_ADMIN_NAME
  };
  assertDemoDeployment(environment);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new DemoBootstrapError("DATABASE_URL is required. Apply the database migrations before running demo bootstrap.");
  }

  // Read only explicitly supplied host/process variables. In particular, do not
  // let a development .env.local override the database selected by the operator.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await bootstrapDemo(prisma, environment);
    console.log(`Demo bootstrap complete: administrator ${result.administrator}; ${result.categoriesCreated} missing RC categories created.`);
    if (result.administrator === "created") {
      console.log("Sign in with the administrator credentials you supplied. DEMO_ADMIN_PASSWORD can now be removed from the hosting environment.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Never print raw database errors, connection strings, passwords or hashes.
  // Our own validation errors contain only fixed, actionable configuration text.
  if (error instanceof DemoBootstrapError) {
    console.error(`Demo bootstrap failed: ${error.message}`);
  } else {
    console.error("Demo bootstrap failed. Check database connectivity, applied migrations and database permissions. Existing data was not overwritten.");
  }
  process.exitCode = 1;
});
