/**
 * KASUMI MCP — Authentication and permission middleware.
 *
 * Three permission tiers:
 *   read   — list tools/resources/prompts, read tools, analyse tools
 *   write  — all read + write/mutate tools
 *   admin  — all write + system tools, stats, capability management
 *
 * Keys are configured via environment variables:
 *   KASUMI_READ_KEY   — grants read tier
 *   KASUMI_WRITE_KEY  — grants write tier (also grants read)
 *   KASUMI_ADMIN_KEY  — grants admin tier (grants all)
 *
 * If NO keys are configured (development mode), all requests are treated as admin.
 */

export type PermissionTier = 'read' | 'write' | 'admin'

const READ_KEY  = process.env['KASUMI_READ_KEY']
const WRITE_KEY = process.env['KASUMI_WRITE_KEY']
const ADMIN_KEY = process.env['KASUMI_ADMIN_KEY']

/** True when no keys are configured — open dev mode. */
export const DEV_MODE = !READ_KEY && !WRITE_KEY && !ADMIN_KEY

/**
 * Resolve the permission tier for a given API key.
 * Returns null if the key is not recognised (and auth is configured).
 */
export function resolvePermission(key: string | undefined): PermissionTier | null {
  if (DEV_MODE) return 'admin'
  if (!key) return null
  if (ADMIN_KEY && key === ADMIN_KEY) return 'admin'
  if (WRITE_KEY && key === WRITE_KEY) return 'write'
  if (READ_KEY  && key === READ_KEY)  return 'read'
  return null
}

/**
 * Check whether a given permission tier is sufficient to meet the required tier.
 */
export function hasPermission(
  actual: PermissionTier | null,
  required: PermissionTier,
): boolean {
  if (!actual) return false
  const rank: Record<PermissionTier, number> = { read: 1, write: 2, admin: 3 }
  return rank[actual] >= rank[required]
}

/**
 * Tool-level permission annotations.
 * Tools without an explicit permission default to 'read' (safe default).
 *
 * This map covers any tool that needs higher-than-default access.
 * Pattern: key = tool name prefix or exact name, value = required tier.
 */
const TOOL_PERMISSION_MAP: Array<{ pattern: RegExp; tier: PermissionTier }> = [
  // Admin-only
  { pattern: /^system_get_stats$/,           tier: 'admin' },
  { pattern: /^system_get_capabilities$/,    tier: 'read'  },

  // Write operations — everything that mutates data
  { pattern: /^nexcel_write_/,               tier: 'write' },
  { pattern: /^nexcel_clear_/,               tier: 'write' },
  { pattern: /^nexcel_insert_/,              tier: 'write' },
  { pattern: /^nexcel_delete_/,              tier: 'write' },
  { pattern: /^nexcel_sort_/,                tier: 'write' },
  { pattern: /^nexcel_set_/,                 tier: 'write' },
  { pattern: /^nexcel_import_/,              tier: 'write' },
  { pattern: /^nexcel_new_/,                 tier: 'write' },
  { pattern: /^nexcel_auto_format_/,         tier: 'write' },
  { pattern: /^nexcel_fill_/,                tier: 'write' },
  { pattern: /^nexcel_freeze_/,              tier: 'write' },
  { pattern: /^nexcel_merge_/,               tier: 'write' },
  { pattern: /^nexcel_unmerge_/,             tier: 'write' },
  { pattern: /^nexcel_create_/,              tier: 'write' },
  { pattern: /^nexcel_delete_named_/,        tier: 'write' },
  { pattern: /^nexcel_write_formula$/,       tier: 'write' },
  { pattern: /^nexcel_rename_/,              tier: 'write' },

  { pattern: /^wordo_write_/,                tier: 'write' },
  { pattern: /^wordo_insert_/,               tier: 'write' },
  { pattern: /^wordo_delete_/,               tier: 'write' },
  { pattern: /^wordo_replace_/,              tier: 'write' },
  { pattern: /^wordo_import_/,               tier: 'write' },
  { pattern: /^wordo_set_/,                  tier: 'write' },
  { pattern: /^wordo_append_/,               tier: 'write' },
  { pattern: /^wordo_normalise_/,            tier: 'write' },

  { pattern: /^kasumi_/,                     tier: 'write' },
]

/** Return the required permission tier for a tool name. */
export function requiredTierForTool(toolName: string): PermissionTier {
  for (const { pattern, tier } of TOOL_PERMISSION_MAP) {
    if (pattern.test(toolName)) return tier
  }
  return 'read'
}
