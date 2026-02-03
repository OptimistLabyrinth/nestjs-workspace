# Why COUNT Query Log is Missing in TypeORM's findAndCount()

## Question

When executing `findAndCount()` in TypeORM with logging enabled, only the SELECT query appears in terminal logs. Why is the COUNT query log not shown?

```typescript
// user.service.ts:61-65
const [users, totalCount] = await this.userRepository.findAndCount({
  skip: (page - 1) * limit,
  take: limit,
  order: { ...orderBy },
});
```

---

## Answer: TypeORM's COUNT Query Optimization

### Root Cause

TypeORM has a **built-in optimization** that skips the COUNT query when the result set is smaller than the requested limit.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Query Parameters                             │
│                                                                 │
│   findAndCount({ skip: 0, take: 10 })                          │
│                                                                 │
│   Requested: 10 rows                                            │
│   Actual data in table: < 10 rows                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              TypeORM Optimization Logic                         │
│                                                                 │
│   1. Execute SELECT query → returns N rows (where N < 10)       │
│                                                                 │
│   2. Check: actualResults.length < take ?                       │
│      - YES (N < 10) → totalCount = skip + N                    │
│      - NO COUNT QUERY NEEDED!                                   │
│                                                                 │
│   3. Return [entities, skip + actualResults.length]             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Internal Mechanism

### TypeORM's getManyAndCount() Implementation

```typescript
// Simplified TypeORM source code
async getManyAndCount(): Promise<[Entity[], number]> {
  const entities = await this.getMany();

  // OPTIMIZATION: If we got fewer results than "take",
  // we know the total without running COUNT
  const take = this.expressionMap.take;
  const skip = this.expressionMap.skip ?? 0;

  if (take && entities.length < take) {
    // No need for COUNT query - total is calculable!
    return [entities, skip + entities.length];
  }

  // Only runs COUNT if result set equals the limit
  const count = await this.getCount();
  return [entities, count];
}
```

### The getCount() Method (When It DOES Run)

```typescript
async getCount(): Promise<number> {
  // Clones the QueryBuilder for count query
  const countQueryBuilder = this.clone()
    .orderBy()           // Clear ORDER BY (unnecessary for count)
    .offset(undefined)   // Clear OFFSET
    .limit(undefined)    // Clear LIMIT
    .skip(undefined)
    .take(undefined);

  // Transforms query to: SELECT COUNT(DISTINCT pk) FROM ...
  return countQueryBuilder.getCountForPagination();
}
```

---

## Optimization Logic Table

| Scenario | SELECT Returns | COUNT Query Runs? | Total Calculation |
|----------|---------------|-------------------|-------------------|
| 3 rows in DB, limit 10 | 3 entities | **NO** | `0 + 3 = 3` |
| 10 rows in DB, limit 10 | 10 entities | **YES** | Needs actual COUNT |
| 100 rows in DB, limit 10 | 10 entities | **YES** | Needs actual COUNT |
| 15 rows, limit 10, skip 10 | 5 entities | **NO** | `10 + 5 = 15` |
| 25 rows, limit 10, skip 10 | 10 entities | **YES** | Needs actual COUNT |

---

## Why This Optimization Exists

### Performance Benefits

1. **Eliminates unnecessary database round-trip** when total is calculable
2. **Reduces database load** - COUNT queries can be expensive on large tables
3. **Faster response times** for small datasets

### Mathematical Proof

When `results.length < take`:

```
If we request 10 rows (take=10) starting from row 0 (skip=0)
And we receive only 3 rows

Then we KNOW:
- There are no more rows after these 3
- Total count = skip + results.length = 0 + 3 = 3

No COUNT query needed!
```

---

## How to Verify

### Test 1: With Few Rows (< limit)

```sql
-- Assuming table has 3 rows, limit=10
-- You will see ONLY:
SELECT "UserModel"."id" AS "UserModel_id", ...
FROM "users" "UserModel"
WHERE "UserModel"."deletedAt" IS NULL
LIMIT 10 OFFSET 0

-- COUNT query is SKIPPED
```

### Test 2: With Many Rows (≥ limit)

```sql
-- Assuming table has 15+ rows, limit=10
-- You will see BOTH:

-- Query 1: SELECT
SELECT "UserModel"."id" AS "UserModel_id", ...
FROM "users" "UserModel"
WHERE "UserModel"."deletedAt" IS NULL
LIMIT 10 OFFSET 0

-- Query 2: COUNT (NOW APPEARS!)
SELECT COUNT(1) AS "cnt"
FROM "users" "UserModel"
WHERE "UserModel"."deletedAt" IS NULL
```

---

## Additional Factor: Repository Code Path

### Custom createQueryBuilder Override

```typescript
// user.repository.ts:11-14
createQueryBuilder(alias?: string): SelectQueryBuilder<UserModel> {
  const cur = alias ?? tableName;
  return super.createQueryBuilder(cur).where(`${cur}.deletedAt IS NULL`);
}
```

### Important Note

When using `findAndCount()` on a custom Repository:

```
userRepository.findAndCount(options)
       │
       ▼
Repository.findAndCount() [inherited]
       │
       ▼
this.manager.findAndCount()  ← Uses EntityManager
       │
       ▼
EntityManager creates its OWN QueryBuilder
       │
       ▼
Does NOT use your custom createQueryBuilder() override!
```

This means:
- The custom `createQueryBuilder()` in `UserRepository` is **bypassed** by `findAndCount()`
- `findAndCount()` uses `EntityManager`'s internal query building
- The soft delete filter still works because of `@DeleteDateColumn()` decorator

---

## Summary

| Question | Answer |
|----------|--------|
| Why no COUNT log? | **Optimization** - TypeORM skips COUNT when `results.length < take` |
| Is this a bug? | **No** - Intentional performance optimization |
| When will COUNT appear? | When table has **≥ limit** rows |
| Is data correct? | **Yes** - Total is mathematically calculated |

---

## Debugging Tips

### Force Both Queries to Log

To verify both queries run, temporarily increase your data:

```sql
-- Insert test data to exceed limit
INSERT INTO users (id, name, email, "createdAt")
SELECT
  gen_random_uuid(),
  'User ' || i,
  'user' || i || '@test.com',
  NOW()
FROM generate_series(1, 20) AS i;
```

### Enable Verbose Logging

```typescript
// postgres.config.ts
logging: ['query', 'error', 'schema', 'warn', 'info', 'log'],
// or
logging: 'all',
```

This documents the internal TypeORM behavior that causes COUNT queries to be optimized away when the result set is smaller than the requested limit.
