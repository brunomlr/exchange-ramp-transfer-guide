import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the local Orca preview proxy to load Next development assets.
  allowedDevOrigins: ["exchange-simulator.orca.localhost"],
  // Pin the workspace root so Next doesn't pick a parent lockfile.
  turbopack: {
    root: __dirname,
  },
  // Don't bundle the (very large) Stellar SDK into server routes — require it
  // natively from node_modules. Avoids Turbopack pegging the CPU and makes
  // /api/send fast in dev.
  serverExternalPackages: ["@stellar/stellar-sdk"],
};

export default nextConfig;
