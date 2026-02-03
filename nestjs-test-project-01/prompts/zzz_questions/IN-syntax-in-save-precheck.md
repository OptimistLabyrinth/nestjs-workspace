# Why TypeORM Uses `WHERE IN` for save() Pre-Check Query

## Question

When executing `userRepository.save(entity)`, TypeORM first runs a SELECT query:

```sql
SELECT
  "UserModel"."id" AS "UserModel_id",
  "UserModel"."name" AS "UserModel_name",
  "UserModel"."email" AS "UserModel_email",
  "UserModel"."createdAt" AS "UserModel_createdAt",
  "UserModel"."updatedAt" AS "UserModel_updatedAt",
  "UserModel"."deletedAt" AS "UserModel_deletedAt"
FROM
  "users" "UserModel"
WHERE
  "UserModel"."id" IN ($1)  -- PARAMETERS: ["019c1d6b-7995-73fb-9c52-75b7ef19f1b6"]
```

**Why `IN ($1)` instead of `= $1` for a single value in the pre-check query?**

---

## Answer: Batch Save Support & Code Unification

### The Core Reason

TypeORM's `save()` method accepts **both single entities AND arrays**:

```typescript
// Single entity
await repository.save(user);

// Array of entities (batch save)
await repository.save([user1, user2, user3]);
```

**The same internal code path handles both cases**, which is why `IN` is always used - it works for 1 or N entities uniformly.

---

## The Complete Query Sequence in save()

```sql
-- 1. PRE-CHECK: Does entity exist?
SELECT ... FROM "users" WHERE "id" IN ($1)

-- 2. TRANSACTION START
START TRANSACTION

-- 3. INSERT (because entity didn't exist) or UPDATE (if it existed)
INSERT INTO "users" (...) VALUES (...) RETURNING ...

-- 4. COMMIT
COMMIT
```

---

## Deep Dive: TypeORM's save() Internal Flow

### Step 1: Normalize Input

```typescript
// TypeORM: EntityManager.save()
async save<Entity>(entity: Entity | Entity[]): Promise<Entity | Entity[]> {
  // Normalize input to array - ALWAYS work with arrays internally
  const entities = Array.isArray(entity) ? entity : [entity];

  // Execute persistence
  return this.executePersistence(entities);
}
```

### Step 2: Extract Primary Keys

```typescript
// Collect ALL entity IDs to check (could be 1 or many)
const idsToCheck = entities
  .filter(e => e.id !== undefined)  // Only entities with IDs
  .map(e => e.id);

// Result for single entity: ["019c1d6b-7995-73fb-9c52-75b7ef19f1b6"]
// Result for batch: ["id1", "id2", "id3"]
```

### Step 3: Load Existing Entities (The Pre-Check SELECT)

```typescript
// TypeORM: src/persistence/EntityPersistExecutor.ts
async loadExistingEntities(entities: Entity[]): Promise<Entity[]> {
  const primaryKeys = entities
    .filter(e => e.id !== undefined)
    .map(e => e.id);

  if (primaryKeys.length === 0) {
    return [];  // All new entities without IDs, skip SELECT
  }

  // Build WHERE clause with IN for ALL primary keys
  // This handles both single and batch cases uniformly
  const qb = this.queryRunner
    .manager
    .createQueryBuilder(EntityClass, alias)
    .whereInIds(primaryKeys);  // ← Uses IN internally

  return await qb.getMany();
}
```

### Step 4: whereInIds() Implementation

```typescript
// TypeORM: src/query-builder/SelectQueryBuilder.ts
whereInIds(ids: any | any[]): this {
  // Normalize to array
  const idsArray = Array.isArray(ids) ? ids : [ids];

  // Get primary key column(s)
  const primaryColumns = this.expressionMap.mainAlias.metadata.primaryColumns;

  if (primaryColumns.length === 1) {
    // Simple primary key: WHERE id IN (...)
    const paramName = this.createParameter(idsArray);
    this.andWhere(`${alias}.${pk.propertyName} IN (:...${paramName})`);
  } else {
    // Composite primary key: WHERE (col1, col2) IN ((...), (...))
    // More complex handling...
  }

  return this;
}
```

### Step 5: Determine INSERT vs UPDATE

```typescript
// TypeORM internal: EntityPersistExecutor.ts
async execute() {
  // ONE query checks ALL entities at once
  const existingEntities = await this.loadExistingEntities(entities);

  // Determine which entities need INSERT vs UPDATE
  const entitiesToInsert = [];
  const entitiesToUpdate = [];

  for (const entity of entities) {
    const existing = existingEntities.find(e => e.id === entity.id);

    if (existing) {
      // Entity exists in DB → UPDATE
      entitiesToUpdate.push({ entity, existing });
    } else {
      // Entity doesn't exist → INSERT
      entitiesToInsert.push(entity);
    }
  }

  // Execute appropriate operations
  await this.executeInserts(entitiesToInsert);
  await this.executeUpdates(entitiesToUpdate);
}
```

---

## Complete save() Flow Diagram

```
repository.save(entity)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Step 1: Normalize Input                             │
│                                                      │
│  entities = [entity]  // Wrap single in array       │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Step 2: Extract Primary Keys                        │
│                                                      │
│  ids = ["019c1d6b-7995-73fb-9c52-75b7ef19f1b6"]     │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Step 3: Pre-Check SELECT (with IN)                  │
│                                                      │
│  SELECT * FROM "users"                               │
│  WHERE "id" IN ($1)                                  │
│                                                      │
│  Returns: [] → entity doesn't exist → INSERT         │
│  Returns: [entity] → entity exists → UPDATE          │
└──────────────────────────────────────────────────────┘
       │
       ├── Entity NOT found ──────────────────┐
       │                                      │
       ▼                                      ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  Step 4a: INSERT        │    │  Step 4b: UPDATE        │
│                         │    │                         │
│  START TRANSACTION      │    │  START TRANSACTION      │
│  INSERT INTO "users"    │    │  UPDATE "users"         │
│  VALUES (...)           │    │  SET name = $1, ...     │
│  RETURNING ...          │    │  WHERE id = $n          │
│  COMMIT                 │    │  COMMIT                 │
└─────────────────────────┘    └─────────────────────────┘
       │                                      │
       └──────────────┬───────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────┐
│  Step 5: Return Saved Entity                         │
│                                                      │
│  // With DB-generated values (createdAt, etc.)       │
│  return hydratedEntity;                              │
└──────────────────────────────────────────────────────┘
```

---

## Why Not Use = for Single Entity?

### Reason 1: Code Unification

```typescript
// WITHOUT unified IN approach (hypothetical - more complex)
async loadExistingEntities(entities) {
  if (entities.length === 1) {
    // Single entity - use =
    return qb.where(`id = :id`, { id: entities[0].id }).getMany();
  } else {
    // Multiple entities - use IN
    return qb.whereInIds(entities.map(e => e.id)).getMany();
  }
}

// WITH unified IN approach (actual TypeORM - simpler)
async loadExistingEntities(entities) {
  // Always use IN - handles 1 or N entities with same code
  return qb.whereInIds(entities.map(e => e.id)).getMany();
}
```

### Reason 2: Batch Optimization

Single SELECT for multiple entities is **far more efficient** than N separate queries:

```sql
-- EFFICIENT: ONE query for 3 entities
SELECT * FROM users WHERE id IN ($1, $2, $3)
-- 1 database round-trip

-- INEFFICIENT: THREE separate queries
SELECT * FROM users WHERE id = $1  -- round-trip 1
SELECT * FROM users WHERE id = $2  -- round-trip 2
SELECT * FROM users WHERE id = $3  -- round-trip 3
-- 3 database round-trips!
```

### Reason 3: PostgreSQL Optimization

PostgreSQL **automatically optimizes** `IN (single_value)` to `=`:

```sql
-- TypeORM generates:
WHERE "id" IN ($1)

-- PostgreSQL internally executes as:
WHERE "id" = $1

-- Proof via EXPLAIN:
EXPLAIN ANALYZE SELECT * FROM users WHERE id IN ('abc-123');
-- Index Scan using users_pkey
-- Index Cond: (id = 'abc-123'::uuid)  ← Converted to =
```

**Zero performance difference** between `IN (single)` and `=`.

---

## Batch Save Example

When saving multiple entities, the efficiency becomes clear:

```typescript
// Batch save
await repository.save([user1, user2, user3]);
```

```sql
-- ONE pre-check query for ALL entities
SELECT * FROM "users" WHERE "id" IN ($1, $2, $3)
-- Returns: [user3] (only user3 exists)

START TRANSACTION

-- INSERT only new entities
INSERT INTO "users" (...) VALUES
  (...),  -- user1
  (...)   -- user2

-- UPDATE existing entities
UPDATE "users" SET ... WHERE "id" = $3  -- user3

COMMIT
```

**Result**: 2 INSERTs + 1 UPDATE determined by a single pre-check query.

---

## Why Pre-Check at All?

### The Upsert Problem

TypeORM's `save()` implements **upsert semantics**:
- If entity doesn't exist → INSERT
- If entity exists → UPDATE

To determine which operation to perform, TypeORM must know if the entity exists **before** executing the mutation.

### Alternative Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Pre-check SELECT (TypeORM default)** | Works on all databases, predictable behavior | Extra query |
| **INSERT ... ON CONFLICT (PostgreSQL)** | Single query, atomic | Database-specific |
| **MERGE (SQL Server)** | Single query, atomic | Database-specific |

TypeORM chose the pre-check approach for **database portability**.

---

## Summary Table

| Question | Answer |
|----------|--------|
| Why `IN` in save()'s pre-check? | **Unified code path** for single and batch saves |
| Why not `=` for single entity? | Same code handles `save(entity)` and `save([entities])` |
| Performance impact? | **None** - PostgreSQL optimizes `IN (single)` to `=` |
| Why pre-check at all? | To determine **INSERT vs UPDATE** (upsert logic) |
| Batch benefit? | One SELECT for N entities instead of N separate queries |

---

## Key Takeaway

The `IN` syntax in save()'s pre-check SELECT is a **design choice for code unification** that:

1. Uses one code path for single and batch operations
2. Enables efficient batch saves with single pre-check query
3. Has zero performance cost for single-entity saves (PostgreSQL optimization)
4. Simplifies TypeORM's internal codebase

This is a trade-off that prioritizes **code maintainability** and **batch efficiency** while relying on database optimizers to handle the single-value case efficiently.
