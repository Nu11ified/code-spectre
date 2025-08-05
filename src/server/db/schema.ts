// Cloud IDE Orchestrator Database Schema
// Defines tables for users, repositories, permissions, IDE sessions, and extensions

import { sql } from "drizzle-orm";
import { index, 
  pgTableCreator, 
  unique,
  pgTable,
  text,
  timestamp,
  boolean,
  integer, 
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `code-spectre_${name}`);

// Users table - extends existing auth pattern
export const users = createTable(
  "user",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    githubId: d.varchar({ length: 255 }).notNull().unique(),
    githubUsername: d.varchar({ length: 255 }).notNull(),
    email: d.varchar({ length: 255 }).notNull(),
    role: d.varchar({ length: 50 }).notNull().default('user'), // 'admin' | 'user'
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("user_github_id_idx").on(t.githubId),
    index("user_email_idx").on(t.email),
    index("user_role_idx").on(t.role),
  ],
);

// Repositories table
export const repositories = createTable(
  "repository",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 255 }).notNull(),
    gitUrl: d.varchar({ length: 500 }).notNull(),
    ownerId: d.integer().references(() => users.id).notNull(),
    deployKeyPublic: d.text(), // SSH public key for read access
    deployKeyPrivate: d.text(), // SSH private key for write access
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("repository_owner_idx").on(t.ownerId),
    index("repository_name_idx").on(t.name),
    unique("repository_git_url_unique").on(t.gitUrl),
  ],
);

// Permissions table - junction table with additional metadata
export const permissions = createTable(
  "permission",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: d.integer().references(() => users.id).notNull(),
    repositoryId: d.integer().references(() => repositories.id).notNull(),
    canCreateBranches: d.boolean().notNull().default(false),
    branchLimit: d.integer().notNull().default(5),
    allowedBaseBranches: d.json().$type<string[]>().notNull().default(['main', 'develop']),
    allowTerminalAccess: d.boolean().notNull().default(true),
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("permission_user_idx").on(t.userId),
    index("permission_repository_idx").on(t.repositoryId),
    unique("permission_user_repository_unique").on(t.userId, t.repositoryId),
  ],
);

// IDE Sessions table - tracks active containers
export const ideSessions = createTable(
  "ide_session",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: d.integer().references(() => users.id).notNull(),
    repositoryId: d.integer().references(() => repositories.id).notNull(),
    branchName: d.varchar({ length: 255 }).notNull(),
    containerId: d.varchar({ length: 255 }).notNull(),
    containerUrl: d.varchar({ length: 500 }).notNull(),
    status: d.varchar({ length: 50 }).notNull().default('running'), // 'running' | 'stopped' | 'error'
    lastAccessedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("ide_session_user_idx").on(t.userId),
    index("ide_session_repository_idx").on(t.repositoryId),
    index("ide_session_status_idx").on(t.status),
    index("ide_session_last_accessed_idx").on(t.lastAccessedAt),
    unique("ide_session_container_id_unique").on(t.containerId),
  ],
);

// Extensions table - global IDE extensions
export const extensions = createTable(
  "extension",
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    extensionId: d.varchar({ length: 255 }).notNull().unique(), // e.g., 'ms-python.python'
    name: d.varchar({ length: 255 }).notNull(),
    version: d.varchar({ length: 50 }).notNull(),
    enabled: d.boolean().notNull().default(true),
    installedBy: d.integer().references(() => users.id).notNull(),
    createdAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("extension_extension_id_idx").on(t.extensionId),
    index("extension_enabled_idx").on(t.enabled),
    index("extension_installed_by_idx").on(t.installedBy),
  ],
);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});