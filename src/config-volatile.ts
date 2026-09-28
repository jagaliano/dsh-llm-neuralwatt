/**
 * Volatile-config helpers for the dsh 0.1.7 schema-derived profile Config.
 *
 * 0.1.7 rewrote settings around the profile Config: `settings.describe()`
 * projects each active entry's schema through `volatileForm()`, so a form
 * contains ONLY fields whose schema nodes carry `meta.volatile`, and a form
 * edit is refused unless its path lies beneath a marked node. On that
 * generation the loader resolves every marked top-level field into a frozen
 * readonly reference ({@link VolatileRef}, `{ get() }`) instead of a plain
 * value, commits later changes WITHOUT remounting the fiber, and dispatches
 * `loader/volatile-update` to the owning fiber.
 *
 * Two helpers keep the rest of the plugin reading a PLAIN {@link Config}:
 *
 * - {@link markVolatileFields} applies `.volatile()` to every top-level field,
 *   so the settings service sees them. Marking changes what the schema
 *   PARSES to (a live reference), not the plugin-facing Config shape.
 * - {@link unwrapVolatileConfig} reads each field through its reference when
 *   one is present — returning a FRESH object per call, because a reference's
 *   identity is stable while its value changes — and returns the input
 *   untouched when no field is marked. That fresh-object property is why the
 *   caller must resolve per use rather than cache by config identity.
 *
 * Only TOP-LEVEL fields are marked: a form write always names a top-level
 * path (`baseURL`, `models`, `proxy`), whose first segment is the marked node,
 * so one unwrap level is complete. Schemastery rejects a nested mark under a
 * marked ancestor anyway ("volatile fields require a fixed object path
 * without an enclosing volatile field"), which is what keeps mark-once
 * sufficient.
 *
 * @module dsh-llm-neuralwatt/config-volatile
 */

/**
 * A live config reference the loader writes in place. Frozen, so a consumer
 * cannot mistake it for an ordinary value and mutate it.
 */
export interface VolatileRef<T> {
  /** Read the current value; changes between calls as settings are written. */
  get(): T
}

/**
 * Mark one schema field volatile.
 *
 * `.volatile()` is a schemastery 3.18.3+ feature and the host line this plugin
 * targets (`dsh 0.1.7-rc.2`) pins `~3.18.4`, so the method is always present
 * at runtime. It is reached through a structural member because schemastery
 * types it as changing the schema's `Mode` generic
 * (`Schema<S, T, 'volatile'>`), which is not assignable to the caller's
 * declared field type — the cast is what preserves that declared type, so
 * {@link Config} stays the plain shape every consumer reads.
 * @param schema - the field schema.
 * @returns the same schema carrying `meta.volatile`.
 */
export function markVolatile<T>(schema: T): T {
  // SAFETY: invariant TypeScript cannot check — `.volatile()` IS declared at
  // schemastery 3.18.4, but it returns `Schema<…, 'volatile'>`, whose output
  // type (`Volatile<T | undefined>`) is not assignable back to the caller's
  // declared field type (TS2322). The cast preserves that declared field type
  // while the runtime value is the same schema instance carrying
  // `meta.volatile`.
  return (schema as unknown as { volatile(): T }).volatile()
}

/**
 * Mark every field of a Config field dict volatile.
 *
 * There is no field to skip here: unlike the sibling provider, this plugin
 * has no composition-only secret literal — the API key lives in the
 * credentials store, never in config. `apiKeyEnv` is a credential *reference*
 * name and must stay visible to the shared Models page, so it is marked too.
 * @param fields - freshly built field schemas.
 * @returns the field dict with every field marked.
 */
export function markVolatileFields<const T extends Record<string, unknown>>(
  fields: T,
): T {
  return Object.fromEntries(
    Object.entries(fields).map(([name, schema]) => [name, markVolatile(schema)]),
  ) as T
}

/**
 * Whether a resolved config value is a volatile reference.
 *
 * Duck-typed on the two properties `createVolatile` produces (a frozen object
 * with a `get` method) rather than a private symbol, because the producing
 * package is not a peer here. Parsed config values are plain JSON (or a
 * `!!jsExpr` wrapper), which are never frozen, so the test cannot misfire on
 * an ordinary field.
 * @param value - one resolved config field.
 * @returns whether the value is a live reference.
 */
export function isVolatileRef(value: unknown): value is VolatileRef<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.isFrozen(value) &&
    typeof (value as { get?: unknown }).get === 'function'
  )
}

/**
 * Read every top-level field through its reference, producing a plain Config.
 *
 * A field whose resolved value is `undefined` is dropped rather than written
 * as an explicit `undefined`: every field here is optional, and consumers
 * branch on `!== undefined`, so the two spellings are equivalent — while the
 * explicit one violates `exactOptionalPropertyTypes`.
 * @param config - the fiber's live config (references or plain values).
 * @returns a fresh plain Config reflecting the current values.
 */
export function unwrapVolatileConfig<T extends object>(config: T): T {
  const entries = Object.entries(config).flatMap(([key, value]): Array<[string, unknown]> => {
    if (!isVolatileRef(value)) return [[key, value]]
    const current = value.get()
    return current === undefined ? [] : [[key, current]]
  })
  return Object.fromEntries(entries) as T
}
