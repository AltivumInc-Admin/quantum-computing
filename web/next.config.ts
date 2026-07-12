import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // A stray lockfile in $HOME otherwise makes Next infer the wrong workspace
  // root (the build warns and picks ~/package-lock.json). Pin the root here.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: { root: __dirname },
};

export default nextConfig;
