import { DEFAULT_APPLICATION_CURRENCY, isApplicationCurrency, type ApplicationCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { ensureUserForActor } from "@/lib/server/users";
import type { Actor } from "@/types/domain";

const CURRENCY_KEY = "application.currency";

export async function getApplicationCurrency(): Promise<ApplicationCurrency> {
  try {
    const setting = await prisma.applicationSetting.findUnique({ where: { key: CURRENCY_KEY } });
    return isApplicationCurrency(setting?.value) ? setting.value : configuredFallbackCurrency();
  } catch {
    return configuredFallbackCurrency();
  }
}

export async function setApplicationCurrency(actor: Actor, currency: string) {
  if (!can(actor.role, "admin:manage-settings")) return { mode: "forbidden" as const };
  if (!isApplicationCurrency(currency)) return { mode: "invalid" as const };

  try {
    const user = await ensureUserForActor(actor);
    const previous = await getApplicationCurrency();
    await prisma.$transaction(async (tx) => {
      await tx.applicationSetting.upsert({
        where: { key: CURRENCY_KEY },
        create: { key: CURRENCY_KEY, value: currency },
        update: { value: currency }
      });
      await tx.listing.updateMany({ data: { currency } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "application.currency_changed",
          entity: "ApplicationSetting",
          entityId: CURRENCY_KEY,
          metadata: { previous, currency, valuesConverted: false }
        }
      });
    });
    return { mode: "updated" as const, currency, previous };
  } catch {
    return { mode: "error" as const };
  }
}

function configuredFallbackCurrency(): ApplicationCurrency {
  const configured = process.env.APP_CURRENCY?.trim().toUpperCase();
  return isApplicationCurrency(configured) ? configured : DEFAULT_APPLICATION_CURRENCY;
}
