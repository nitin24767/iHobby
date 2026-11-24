import type { NextConfig } from "next";

function storageImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const publicUrl = process.env.STORAGE_PUBLIC_URL;
  if (!publicUrl) return [];

  try {
    const url = new URL(publicUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const path = url.pathname.replace(/\/$/, "");
    return [{
      protocol: url.protocol.slice(0, -1) as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: `${path || ""}/**`
    }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["nodemailer", "pdf-parse"],
  images: {
    remotePatterns: storageImagePatterns()
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
      ]
    }];
  }
};

export default nextConfig;
