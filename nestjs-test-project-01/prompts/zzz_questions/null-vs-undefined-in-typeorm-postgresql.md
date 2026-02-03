# null vs undefined in TypeORM + PostgreSQL Integration

## Core Distinction

| Aspect | `null` | `undefined` |
|--------|--------|-------------|
| **JavaScript meaning** | Intentional absence of value | Variable declared but not assigned |
| **TypeORM interpretation** | "Set this column to NULL" | "Ignore this field, don't include in query" |
| **PostgreSQL result** | Column becomes `NULL` | Column unchanged (on UPDATE) or uses DEFAULT (on INSERT) |

---

## Deep Dive: How TypeORM Processes Each

### 1. INSERT Operations

```typescript
// Scenario: Creating a user with nullable 'bio' field

// Case A: null
await userRepository.save({ name: 'John', bio: null });
// SQL: INSERT INTO user (name, bio) VALUES ('John', NULL)
// Result: bio = NULL

// Case B: undefined
await userRepository.save({ name: 'John', bio: undefined });
// SQL: INSERT INTO user (name) VALUES ('John')
// Result: bio = DEFAULT value (or NULL if no default)

// Case C: field omitted entirely
await userRepository.save({ name: 'John' });
// SQL: INSERT INTO user (name) VALUES ('John')
// Result: Same as undefined - uses DEFAULT
```

### 2. UPDATE Operations (Critical Difference)

```typescript
// Existing user: { id: 1, name: 'John', bio: 'Developer', deletedAt: null }

// Case A: null - EXPLICITLY CLEARS the field
await userRepository.save({ id: 1, bio: null });
// SQL: UPDATE user SET bio = NULL WHERE id = 1
// Result: bio becomes NULL

// Case B: undefined - PRESERVES existing value
await userRepository.save({ id: 1, bio: undefined });
// SQL: UPDATE user SET WHERE id = 1  (bio not in SET clause)
// Result: bio remains 'Developer'

// Case C: Using update() method
await userRepository.update(1, { bio: null });      // Sets to NULL
await userRepository.update(1, { bio: undefined }); // Ignored entirely
```

---

## TypeORM Internal Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    TypeORM Query Builder                        │
├─────────────────────────────────────────────────────────────────┤
│  Input Object: { name: 'John', bio: null, age: undefined }      │
│                                                                 │
│  Processing:                                                    │
│  ┌─────────┬───────────┬─────────────────────────────────────┐  │
│  │ Field   │ Value     │ Action                              │  │
│  ├─────────┼───────────┼─────────────────────────────────────┤  │
│  │ name    │ 'John'    │ Include in query                    │  │
│  │ bio     │ null      │ Include in query as NULL            │  │
│  │ age     │ undefined │ SKIP - not included in query        │  │
│  └─────────┴───────────┴─────────────────────────────────────┘  │
│                                                                 │
│  Generated SQL: INSERT INTO user (name, bio) VALUES ('John', NULL)
└─────────────────────────────────────────────────────────────────┘
```

---

## Pros and Cons

### Using `null`

| Pros | Cons |
|------|------|
| Explicit intent - "this should be empty" | Can accidentally overwrite existing data |
| Predictable behavior across all operations | Must be intentional in partial updates |
| Maps directly to SQL NULL | Type system requires `T \| null` declarations |
| Clear for soft-delete patterns (`deletedAt = null` → `new Date()`) | |

### Using `undefined`

| Pros | Cons |
|------|------|
| Safe for partial updates - won't overwrite unintended fields | Implicit behavior can cause confusion |
| Natural for optional DTO fields | Cannot explicitly "clear" a field |
| Works well with spread operator patterns | Different behavior INSERT vs UPDATE |
| TypeScript optional properties `field?:` naturally produce undefined | Harder to debug - "why didn't this update?" |

---

## Practical Patterns

### Pattern 1: Partial Update DTO (Safe with `undefined`)

```typescript
// UpdateUserInput - fields are optional (undefined if not provided)
class UpdateUserInput {
  name?: string;      // undefined if not in request
  bio?: string;       // undefined if not in request
}

// Service
async update(id: string, input: UpdateUserInput) {
  const user = await this.findUserOrThrow(id);
  // Spread safely - undefined fields won't overwrite
  return this.userRepository.save({ ...user, ...input });
}

// Usage: Only updates 'name', bio preserved
await update('1', { name: 'Jane' });
```

### Pattern 2: Explicit Clear Field (Requires `null`)

```typescript
// When you NEED to clear a field
class UpdateUserInput {
  bio?: string | null;  // undefined = don't touch, null = clear it
}

// Service must handle both
async update(id: string, input: UpdateUserInput) {
  const user = await this.findUserOrThrow(id);

  // Only apply non-undefined values
  if (input.bio !== undefined) {
    user.bio = input.bio; // Could be string or null
  }

  return this.userRepository.save(user);
}
```

### Pattern 3: Soft Delete

```typescript
// Correct usage - null vs Date
async remove(id: string): Promise<UserEntity> {
  const user = await this.findUserOrThrow(id);
  user.deletedAt = new Date();  // Explicitly set to mark as deleted
  // ...
}

async restore(id: string): Promise<UserEntity> {
  const user = await this.findDeletedUserOrThrow(id);
  user.deletedAt = null;  // Explicitly clear to restore
  // ...
}
```

---

## PostgreSQL Wire Protocol Perspective

```
┌──────────────────────────────────────────────────────────────────┐
│  TypeScript          TypeORM             PostgreSQL              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  null       ───────► Parameter: NULL ───► Column = NULL          │
│                      (sent to DB)                                │
│                                                                  │
│  undefined  ───────► Not in query   ───► Column unchanged        │
│                      (filtered out)       or DEFAULT             │
│                                                                  │
│  ''         ───────► Parameter: ''  ───► Column = '' (empty str) │
│             (empty string is NOT null!)                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Common Pitfalls

### Pitfall 1: Accidental Data Loss

```typescript
// DANGEROUS - fetching partial data then saving
const user = await repo.findOne({
  where: { id },
  select: ['id', 'name']  // bio not selected = undefined
});

user.name = 'Updated';
await repo.save(user);  // bio is undefined, but...

// If using save() with entity that has bio: undefined
// TypeORM may or may not include it depending on version/config
// SAFER: use update() for partial updates
await repo.update(id, { name: 'Updated' });
```

### Pitfall 2: JSON/API Serialization

```typescript
// Frontend sends: { "bio": null }
// After JSON.parse: { bio: null }  ✓ Preserved

// Frontend sends: { }  (field omitted)
// After JSON.parse: { }  → bio is undefined ✓

// But some serializers convert undefined → null!
JSON.stringify({ bio: undefined }) // → "{}"  (field omitted)
JSON.stringify({ bio: null })      // → '{"bio":null}'
```

### Pitfall 3: Class Transformer (NestJS DTOs)

```typescript
// class-transformer behavior
class UpdateDto {
  @IsOptional()
  bio?: string;
}

// If request body has { "bio": null }
// class-transformer may convert null → undefined
// depending on configuration!

// Solution: explicit null handling
@IsOptional()
@ValidateIf((_, value) => value !== null)
bio?: string | null;
```

---

## Best Practices Summary

| Scenario | Recommendation |
|----------|----------------|
| Partial updates (PATCH) | Use `undefined` / optional fields |
| Explicitly clearing a field | Use `null` |
| Soft delete timestamps | Use `null` (not deleted) vs `Date` (deleted) |
| Required fields on INSERT | Never `null` or `undefined` |
| DTO design | `field?: T \| null` for maximum flexibility |
| Database column | Always define DEFAULT or allow NULL explicitly |

---

## TypeORM Methods Comparison

| Method | `null` behavior | `undefined` behavior |
|--------|----------------|---------------------|
| `save()` | Sets column to NULL | Skips field (preserves existing on UPDATE) |
| `insert()` | Sets column to NULL | Uses DEFAULT or NULL |
| `update()` | Sets column to NULL | Skips field entirely |
| `createQueryBuilder().update().set()` | Sets column to NULL | Skips field |

---

## Key Takeaways

1. **`null` = explicit action** - "Set this to nothing"
2. **`undefined` = no action** - "Don't touch this field"
3. **For partial updates**, prefer `undefined` (safer)
4. **For clearing values**, you must use `null`
5. **Always be explicit** in your DTOs about which approach you're using
