import {
  BarChart3,
  Bell,
  Bot,
  Boxes,
  ClipboardCheck,
  Gavel,
  Heart,
  Home,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Upload,
  Users,
  Wrench
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { defaultDashboardFor, type Permission } from "@/lib/rbac";
import { getDatabaseHealth } from "@/lib/server/database-health";
import {
  getMarketplaceScopeWithCounts,
  getNavigationCountsForActor,
  getWalletSummaryForActor,
  type NavigationCounts,
  type RcScopeWithCounts
} from "@/lib/server/marketplace";
import { getNotificationsForActor } from "@/lib/server/notifications";
import type { Actor, Role } from "@/types/domain";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  count?: string;
  permission?: Permission;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

function navGroupsFor(role: Role, scope: RcScopeWithCounts, counts: NavigationCounts, creditBalance: number): NavGroup[] {
  const vehicles = String(scope.sections.find((item) => item.id === "vehicles")?.count ?? 0);
  const components = String(scope.sections.find((item) => item.id === "components")?.count ?? 0);

  if (role === "SELLER") {
    return [
      {
        label: "Sell",
        items: [
          { href: "/dashboard/seller", label: "Seller dashboard", icon: BarChart3 },
          { href: "/sell/new", label: "New listing", icon: Plus },
          { href: "/sell/listings", label: "My listings", icon: Boxes, count: String(counts.sellerListings) },
          { href: "/offers", label: "Offers", icon: Tag, count: String(counts.pendingOffers) }
        ]
      },
      {
        label: "Tools",
        items: [
          { href: "/tools/agent", label: "Marketplace Agent", icon: Bot },
          { href: "/tools/build", label: "Build & Configure", icon: Wrench },
          { href: "/tools/repair", label: "Repair Advisor", icon: ShieldCheck },
          { href: "/tools/pricing", label: "Pricing engine", icon: Tag }
        ]
      },
      {
        label: "Account",
        items: [
          { href: "/watchlist", label: "Watchlist", icon: Heart, count: String(counts.watchlist) },
          { href: "/wallet", label: "Credits & payouts", icon: Gavel, count: String(creditBalance) },
          { href: "/loyalty", label: "Loyalty & Rewards", icon: Bell },
          { href: "/messages", label: "Messages", icon: MessageSquare, count: String(counts.messages) }
        ]
      }
    ];
  }

  if (role === "ADMIN") {
    return [
      {
        label: "Operations",
        items: [
          { href: "/dashboard/admin", label: "Admin dashboard", icon: ShieldCheck },
          { href: "/admin/listings", label: "Moderation queue", icon: ClipboardCheck, count: String(counts.pendingListings) },
          { href: "/admin/bulk-upload", label: "Bulk upload", icon: Upload },
          { href: "/admin/reports", label: "Trust reports", icon: ShieldCheck, count: String(counts.openReports) },
          { href: "/admin/seller-applications", label: "Seller approvals", icon: ClipboardCheck, count: String(counts.sellerApplications) },
          { href: "/offers", label: "Offers", icon: Tag, count: String(counts.pendingOffers) },
          { href: "/admin/users", label: "Users", icon: Users },
          { href: "/admin/settings", label: "Settings", icon: Settings },
          { href: "/admin/categories", label: "RC taxonomy", icon: Wrench },
          { href: "/admin/audit", label: "Audit log", icon: BarChart3 },
          { href: "/messages", label: "Messages", icon: MessageSquare, count: String(counts.messages) }
        ]
      },
      {
        label: "Seller tools",
        items: [
          { href: "/dashboard/seller", label: "Seller dashboard", icon: BarChart3 },
          { href: "/sell/new", label: "New listing", icon: Plus },
          { href: "/sell/listings", label: "Listing inventory", icon: Boxes }
        ]
      },
      {
        label: "Tools",
        items: [
          { href: "/tools/agent", label: "Marketplace Agent", icon: Bot },
          { href: "/tools/build", label: "Build & Configure", icon: Wrench },
          { href: "/tools/repair", label: "Repair Advisor", icon: ShieldCheck },
          { href: "/tools/pricing", label: "Pricing engine", icon: Tag }
        ]
      },
      {
        label: "Marketplace",
        items: [
          { href: "/?section=vehicles", label: "Vehicles", icon: Home, count: vehicles },
          { href: "/?section=components", label: "Components", icon: Boxes, count: components }
        ]
      }
    ];
  }

  if (role === "BUYER") {
    return [
      {
        label: "Browse",
        items: [
          { href: "/?section=vehicles", label: "Vehicles", icon: Home, count: vehicles },
          { href: "/?section=components", label: "Components", icon: Boxes, count: components },
          { href: "/bids", label: "My bids", icon: Gavel, count: String(counts.activeBids) },
          { href: "/watchlist", label: "Watchlist", icon: Heart, count: String(counts.watchlist) }
        ]
      },
      {
        label: "Workshop",
        items: [
          { href: "/tools/agent", label: "Marketplace Agent", icon: Bot },
          { href: "/tools/build", label: "Build & Configure", icon: Wrench },
          { href: "/tools/repair", label: "Repair Advisor", icon: ShieldCheck },
          { href: "/tools/pricing", label: "Pricing Engine", icon: Tag },
          { href: "/account/seller-application", label: "Sell something", icon: Plus }
        ]
      },
      {
        label: "Account",
        items: [
          { href: "/dashboard/buyer", label: "Dashboard", icon: BarChart3 },
          { href: "/offers", label: "Offers", icon: Tag, count: String(counts.pendingOffers) },
          { href: "/wallet", label: "Credits & Wallet", icon: Gavel, count: String(creditBalance) },
          { href: "/loyalty", label: "Loyalty & Rewards", icon: Bell },
          { href: "/messages", label: "Messages", icon: MessageSquare, count: String(counts.messages) }
        ]
      }
    ];
  }

  return [
    {
      label: "Browse",
        items: [
        { href: "/?section=vehicles", label: "Vehicles", icon: Home, count: vehicles },
        { href: "/?section=components", label: "Components", icon: Boxes, count: components },
        { href: "/sign-in", label: "Sign in", icon: ShieldCheck }
      ]
    }
  ];
}

export async function SiteShell({ children }: { children: ReactNode }) {
  const [actor, database, scope] = await Promise.all([getCurrentActor(), getDatabaseHealth(), getMarketplaceScopeWithCounts()]);
  const [counts, notifications, wallet] = await Promise.all([
    getNavigationCountsForActor(actor),
    getNotificationsForActor(actor),
    getWalletSummaryForActor(actor)
  ]);
  const navGroups = navGroupsFor(actor.role, scope, counts, wallet.balanceCredits);

  return (
    <div className="app-grid">
      <Link href="/" className="brand focus-ring">
        <div className="brand-mark">iH</div>
        <div className="brand-name">iHobbyWorld</div>
        <div className="brand-tag mono upper">RC</div>
      </Link>

      <Topbar actor={actor} database={database} notifications={notifications} creditBalance={wallet.balanceCredits} />

      <aside className="sidebar">
        {navGroups.map((group) => (
          <nav key={group.label} className="nav-group" aria-label={group.label}>
            <div className="nav-label mono upper">{group.label}</div>
            {group.items.map((item) => (
              <Link key={`${group.label}-${item.href}-${item.label}`} href={item.href} className="nav-item focus-ring">
                <item.icon size={16} />
                <span>{item.label}</span>
                {item.count ? <span className="nav-count mono">{item.count}</span> : null}
              </Link>
            ))}
          </nav>
        ))}
      </aside>

      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

function Topbar({
  actor,
  database,
  notifications,
  creditBalance
}: {
  actor: Actor;
  database: Awaited<ReturnType<typeof getDatabaseHealth>>;
  notifications: Awaited<ReturnType<typeof getNotificationsForActor>>;
  creditBalance: number;
}) {
  return (
    <header className="topbar">
      <form action="/" className="topbar-search focus-within:outline focus-within:outline-2 focus-within:outline-[var(--ink)]">
        <Search size={16} />
        <input name="q" placeholder="Search vehicles, parts, sellers" />
        <span className="kbd mono">/</span>
      </form>
      <div className="ml-auto flex items-center gap-3">
        <span
          className={
            database.connected
              ? "hidden rounded-full border border-transparent bg-emerald-100 px-3 py-1 text-xs font-bold text-[var(--green)] sm:inline-flex"
              : "hidden rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-bold text-[var(--accent)] sm:inline-flex"
          }
          title={database.connected ? `${database.listingCount} listings loaded from PostgreSQL` : "Using bundled fallback data"}
        >
          {database.label}
        </span>
        {actor.isAuthenticated ? (
          <>
            <span className="credits-pill mono">
              <span className="dot" />
              <b>{creditBalance.toLocaleString()}</b> cr
            </span>
            <NotificationBell
              unreadCount={notifications.unreadCount}
              notifications={notifications.items}
            />
            <LinkButton href={defaultDashboardFor(actor.role)} size="sm" variant="ghost">
              Dashboard
            </LinkButton>
            <form action="/api/logout" method="post">
              <button className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-semibold">
                Sign out
              </button>
            </form>
            <div className="hidden text-right text-sm sm:block">
              <div className="font-semibold">{actor.displayName}</div>
              <div className="text-xs capitalize text-[var(--ink-muted)]">{actor.role.toLowerCase()}</div>
            </div>
            <div className="grid size-[30px] place-items-center rounded-full bg-[var(--teal)] text-xs font-bold text-white">
              {actor.avatarInitials}
            </div>
          </>
        ) : (
          <>
            <LinkButton href="/sign-in" size="sm">
              Sign in
            </LinkButton>
            <LinkButton href="/sign-up" size="sm" variant="primary">
              Sign up
            </LinkButton>
          </>
        )}
      </div>
    </header>
  );
}
