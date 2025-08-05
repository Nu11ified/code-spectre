import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    ADMIN_EMAIL: z.string().email(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    
    // Docker Configuration
    DOCKER_SOCKET_PATH: z.string().default("/var/run/docker.sock"),
    DOCKER_NETWORK_NAME: z.string().default("cloud-ide-network"),
    CODE_SERVER_IMAGE: z.string().default("codercom/code-server:latest"),
    SESSION_TIMEOUT_MINUTES: z.string().transform(Number).default("60"),
    MAX_CONTAINERS: z.string().transform(Number).default("50"),
    DEFAULT_MEMORY_LIMIT: z.string().default("2g"),
    DEFAULT_CPU_LIMIT: z.string().default("1.0"),
    
    // Traefik Configuration
    DOMAIN: z.string().default("localhost"),
    ENABLE_TLS: z.string().transform(val => val === "true").default("false"),
    ACME_EMAIL: z.string().email().default("admin@example.com"),
    ACME_CA_SERVER: z.string().url().optional(),
    TRAEFIK_DASHBOARD: z.string().transform(val => val === "true").default("true"),
    TRAEFIK_INSECURE: z.string().transform(val => val === "true").default("true"),
    TRAEFIK_LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
    TRAEFIK_BASIC_AUTH: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
    NEXT_PUBLIC_URL: z.string().url(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    
    // Docker Configuration
    DOCKER_SOCKET_PATH: process.env.DOCKER_SOCKET_PATH,
    DOCKER_NETWORK_NAME: process.env.DOCKER_NETWORK_NAME,
    CODE_SERVER_IMAGE: process.env.CODE_SERVER_IMAGE,
    SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES,
    MAX_CONTAINERS: process.env.MAX_CONTAINERS,
    DEFAULT_MEMORY_LIMIT: process.env.DEFAULT_MEMORY_LIMIT,
    DEFAULT_CPU_LIMIT: process.env.DEFAULT_CPU_LIMIT,
    
    // Traefik Configuration
    DOMAIN: process.env.DOMAIN,
    ENABLE_TLS: process.env.ENABLE_TLS,
    ACME_EMAIL: process.env.ACME_EMAIL,
    ACME_CA_SERVER: process.env.ACME_CA_SERVER,
    TRAEFIK_DASHBOARD: process.env.TRAEFIK_DASHBOARD,
    TRAEFIK_INSECURE: process.env.TRAEFIK_INSECURE,
    TRAEFIK_LOG_LEVEL: process.env.TRAEFIK_LOG_LEVEL,
    TRAEFIK_BASIC_AUTH: process.env.TRAEFIK_BASIC_AUTH,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
