import { randomBytes } from "node:crypto";
import { UserRole, UserStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "./passwords";

type DemoBootstrapClient = Pick<PrismaClient, "$transaction">;

export interface DemoBootstrapEnvironment {
  DEPLOYMENT_MODE?: string;
  DEMO_ADMIN_EMAIL?: string;
  DEMO_ADMIN_PASSWORD?: string;
  DEMO_ADMIN_NAME?: string;
}

export interface DemoBootstrapResult {
  administrator: "created" | "preserved";
  categoriesCreated: number;
}

export class DemoBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoBootstrapError";
  }
}

// These are the same RC categories used by the application. Inserting missing
// rows must never reactivate or overwrite categories an administrator has edited.
const rcCategories = [
  {
    slug: "drones",
    name: "Drones",
    description: "Camera drones, FPV quads, cinewhoops, frames, motors, ESCs, packs, props, and video gear.",
    attributes: { required: ["brand", "model"], optional: ["flightTime", "batteryCount", "controller", "firmware", "airframe"] }
  },
  {
    slug: "helis",
    name: "Helicopters",
    description: "Electric and nitro helicopters, flybarless systems, blades, canopies, and spares.",
    attributes: { required: ["brand", "model"], optional: ["rotorSize", "powerSystem", "gyro", "bladeCondition"] }
  },
  {
    slug: "planes",
    name: "Planes",
    description: "Foamies, warbirds, gliders, balsa kits, servos, receivers, engines, and props.",
    attributes: { required: ["brand", "model"], optional: ["wingspan", "powerSystem", "radio", "airframeMaterial"] }
  },
  {
    slug: "cars",
    name: "Cars",
    description: "Crawlers, buggies, touring cars, drift builds, tires, shocks, diffs, ESCs, and batteries.",
    attributes: { required: ["brand", "model"], optional: ["scale", "drivetrain", "motor", "battery"] }
  }
];

const developmentPasswords = new Set(["admin@123", "seller@123", "buyer@123"]);

export function assertDemoDeployment(environment: DemoBootstrapEnvironment) {
  if (environment.DEPLOYMENT_MODE !== "demo") {
    throw new DemoBootstrapError("Demo bootstrap requires DEPLOYMENT_MODE=demo. It cannot initialize a production marketplace.");
  }
}

function initialAdministrator(environment: DemoBootstrapEnvironment) {
  if (!environment.DEMO_ADMIN_EMAIL || !environment.DEMO_ADMIN_PASSWORD) {
    throw new DemoBootstrapError("No administrator exists. Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD to create the first demo administrator.");
  }

  const email = z.string().trim().toLowerCase().email().max(120).safeParse(environment.DEMO_ADMIN_EMAIL);
  if (!email.success) {
    throw new DemoBootstrapError("DEMO_ADMIN_EMAIL must be a valid email address of at most 120 characters.");
  }

  const password = environment.DEMO_ADMIN_PASSWORD;
  if (developmentPasswords.has(password.trim().toLowerCase())) {
    throw new DemoBootstrapError("Development seed passwords are not allowed for the demo administrator.");
  }
  if (
    password.length < 12 || password.length > 128 ||
    !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) || !/[^A-Za-z0-9\s]/.test(password)
  ) {
    throw new DemoBootstrapError("DEMO_ADMIN_PASSWORD must contain 12–128 characters, including uppercase and lowercase letters, a number, and a symbol.");
  }

  const displayName = z.string().trim().min(2).max(80).safeParse(environment.DEMO_ADMIN_NAME ?? "Demo Administrator");
  if (!displayName.success) {
    throw new DemoBootstrapError("DEMO_ADMIN_NAME must contain 2–80 characters when provided.");
  }

  return { email: email.data, password, displayName: displayName.data };
}

/**
 * One controlled initialization path for a fresh demo database. This deliberately
 * does not call the development seed or change its production guard. Credentials
 * are only needed when no administrator exists, so they can be removed after the
 * first successful run. Existing users, passwords, roles and inventory are left
 * intact, including an existing administrator that has been suspended or closed.
 */
export async function bootstrapDemo(
  client: DemoBootstrapClient,
  environment: DemoBootstrapEnvironment
): Promise<DemoBootstrapResult> {
  assertDemoDeployment(environment);

  return client.$transaction(async (tx) => {
    // A transaction-scoped PostgreSQL advisory lock serializes concurrent runs.
    // Return an integer column rather than PostgreSQL's void lock result so the
    // result can be decoded by the Prisma PostgreSQL driver adapter.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(481010, 1)`;

    const existingAdministrator = await tx.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true }
    });
    let administrator: DemoBootstrapResult["administrator"] = "preserved";

    if (!existingAdministrator) {
      const input = initialAdministrator(environment);
      const existingAccount = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true }
      });
      if (existingAccount) {
        throw new DemoBootstrapError("DEMO_ADMIN_EMAIL already belongs to an account. Bootstrap will not promote or reset it. Use an unused email or a controlled administrator recovery procedure.");
      }

      const passwordHash = await hashPassword(input.password);
      const createdAdministrator = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          handle: `demo-admin-${randomBytes(8).toString("hex")}`,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE
        },
        select: { id: true }
      });
      await tx.auditLog.create({
        data: {
          actorId: createdAdministrator.id,
          action: "demo.bootstrap.admin-created",
          entity: "User",
          entityId: createdAdministrator.id,
          metadata: { source: "demo-bootstrap" }
        }
      });
      administrator = "created";
    }

    const categories = await tx.hobbyCategory.createMany({
      data: rcCategories,
      skipDuplicates: true
    });

    return { administrator, categoriesCreated: categories.count };
  }, { maxWait: 10_000, timeout: 30_000 });
}
