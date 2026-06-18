import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";

const config: NextConfig = {
  transpilePackages: ["@iam/shared"],
  async rewrites() {
    // Dev: the browser calls same-origin /api/* and Next proxies to the API.
    // Same-origin means the sameSite:"lax" refresh cookie is sent/accepted
    // without cross-origin CORS-cookie gymnastics. In prod (Phase 10) API_ORIGIN
    // points at the deployed API and the cookie uses sameSite:"none"; secure.
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default config;
