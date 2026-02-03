# GraphQL-TypeORM Integration: Full Request Lifecycle

This document explains the complete lifecycle from GraphQL request to database execution and back to GraphQL response in a NestJS application.

---

## Table of Contents

1. [Overview Diagram](#1-overview-diagram)
2. [Phase 1: HTTP Request Reception](#2-phase-1-http-request-reception)
3. [Phase 2: GraphQL Processing (Apollo Server)](#3-phase-2-graphql-processing-apollo-server)
4. [Phase 3: NestJS Resolver Execution](#4-phase-3-nestjs-resolver-execution)
5. [Phase 4: Service Layer](#5-phase-4-service-layer)
6. [Phase 5: TypeORM Query Building](#6-phase-5-typeorm-query-building)
7. [Phase 6: Database Execution](#7-phase-6-database-execution)
8. [Phase 7: Entity Hydration](#8-phase-7-entity-hydration)
9. [Phase 8: Response Transformation](#9-phase-8-response-transformation)
10. [Code Path Trace](#10-code-path-trace)

---

## 1. Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser/Postman)                         │
│                                                                             │
│   POST /graphql                                                             │
│   { "query": "query { users(paginationInput: {...}) { items { id } } }" }  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: HTTP LAYER (Express/Fastify)                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Middleware │→ │    CORS     │→ │   Body      │→ │   Route     │        │
│  │   Stack     │  │   Handler   │  │   Parser    │  │  /graphql   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: GRAPHQL PROCESSING (Apollo Server)                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Lexer     │→ │   Parser    │→ │  Validator  │→ │  Executor   │        │
│  │  (Tokens)   │  │   (AST)     │  │  (Schema)   │  │ (Resolver)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: NESTJS RESOLVER                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  @Query(() => PaginationOffsetOutput, { name: 'users' })        │       │
│  │  findManyOffset(@Args('paginationInput') input) { ... }         │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                          │                                                  │
│                          ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  ValidationPipe: transform + validate PaginationOffsetInput     │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: SERVICE LAYER                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  UserService.findManyOffset(paginationInput)                    │       │
│  │  → userRepository.findAndCount({ skip, take, order })           │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: TYPEORM QUERY BUILDING                                            │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  EntityManager.find() → QueryBuilder                            │       │
│  │  → SELECT "UserModel"."id" AS "UserModel_id", ...               │       │
│  │    FROM "users" "UserModel"                                     │       │
│  │    WHERE "UserModel"."deletedAt" IS NULL                        │       │
│  │    LIMIT 10 OFFSET 0                                            │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: DATABASE EXECUTION                                                │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  Connection Pool → pg Driver → PostgreSQL                       │       │
│  │  ← Raw Result: [{ UserModel_id: "...", UserModel_name: "..." }] │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 7: ENTITY HYDRATION                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  RawSqlResultsToEntityTransformer.transform()                   │       │
│  │  "UserModel_id" → alias="UserModel", column="id"                │       │
│  │  → UserModel { id, name, email, createdAt, ... }                │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 8: RESPONSE TRANSFORMATION                                           │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  UserMapper.toEntity(UserModel) → UserEntity                    │       │
│  │  GraphQL Field Selection → JSON Serialization                   │       │
│  └─────────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               CLIENT RESPONSE                               │
│   { "data": { "users": { "items": [...], "totalCount": 100, ... } } }      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: HTTP Request Reception

### 2.1 Request Flow

```
Client HTTP Request
       │
       ▼
┌──────────────────────────────────────────────────────┐
│              Express/Fastify HTTP Server             │
│                                                      │
│  1. TCP Connection Accept                            │
│  2. HTTP Request Parsing                             │
│  3. Request Object Creation                          │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│              NestJS Middleware Pipeline              │
│                                                      │
│  app.use(cors())                                     │
│  app.use(bodyParser.json())                          │
│  app.useGlobalPipes(new ValidationPipe(...))         │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│              Route Resolution                        │
│                                                      │
│  POST /graphql → ApolloDriver Handler               │
└──────────────────────────────────────────────────────┘
```

### 2.2 NestJS Bootstrap (main.ts)

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe - processes ALL incoming requests
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,       // Auto-transform payloads to DTO instances
      whitelist: true,       // Strip properties not in DTO
      forbidNonWhitelisted: true,  // Throw error on unknown properties
    }),
  );

  await app.listen(3000);
}
```

### 2.3 Internal Mechanism: Request Context Creation

```typescript
// Simplified internal NestJS flow
class NestApplication {
  async handleRequest(req: IncomingMessage, res: ServerResponse) {
    // 1. Create execution context
    const context = new ExecutionContext(req, res);

    // 2. Run middleware chain
    await this.middlewareModule.run(context);

    // 3. Match route
    const handler = this.router.match('POST', '/graphql');

    // 4. Execute guards
    await this.guardsConsumer.tryActivate(context, handler);

    // 5. Execute interceptors (pre)
    const interceptorsContext = await this.interceptorsConsumer.intercept(context);

    // 6. Invoke handler (Apollo Server)
    const result = await handler.execute(context);

    // 7. Execute interceptors (post)
    return interceptorsContext.transform(result);
  }
}
```

---

## 3. Phase 2: GraphQL Processing (Apollo Server)

### 3.1 GraphQL Query Parsing Pipeline

```
Raw Query String
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                    LEXER (Tokenizer)                 │
│                                                      │
│  Input:  "query { users { id name } }"              │
│  Output: [QUERY, LBRACE, NAME:users, LBRACE, ...]   │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                    PARSER (AST Builder)              │
│                                                      │
│  Tokens → Abstract Syntax Tree (AST)                 │
│                                                      │
│  DocumentNode {                                      │
│    definitions: [                                    │
│      OperationDefinitionNode {                       │
│        operation: "query",                           │
│        selectionSet: {                               │
│          selections: [                               │
│            FieldNode { name: "users", ... }          │
│          ]                                           │
│        }                                             │
│      }                                               │
│    ]                                                 │
│  }                                                   │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                    VALIDATOR                         │
│                                                      │
│  Checks against schema:                              │
│  - Field exists on type?                             │
│  - Arguments correct?                                │
│  - Types compatible?                                 │
│  - No circular fragments?                            │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                    EXECUTOR                          │
│                                                      │
│  Traverses AST and calls resolvers                   │
│  for each field in selection set                     │
└──────────────────────────────────────────────────────┘
```

### 3.2 AST Structure for Users Query

```typescript
// Actual AST for: query { users(paginationInput: { page: 1, limit: 10 }) { items { id name } } }
{
  kind: "Document",
  definitions: [{
    kind: "OperationDefinition",
    operation: "query",
    selectionSet: {
      kind: "SelectionSet",
      selections: [{
        kind: "Field",
        name: { kind: "Name", value: "users" },
        arguments: [{
          kind: "Argument",
          name: { kind: "Name", value: "paginationInput" },
          value: {
            kind: "ObjectValue",
            fields: [
              { name: { value: "page" }, value: { kind: "IntValue", value: "1" } },
              { name: { value: "limit" }, value: { kind: "IntValue", value: "10" } }
            ]
          }
        }],
        selectionSet: {
          selections: [{
            kind: "Field",
            name: { kind: "Name", value: "items" },
            selectionSet: {
              selections: [
                { kind: "Field", name: { value: "id" } },
                { kind: "Field", name: { value: "name" } }
              ]
            }
          }]
        }
      }]
    }
  }]
}
```

### 3.3 Schema-First vs Code-First

```typescript
// app.module.ts - Code-First approach
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.gql'),  // Code-First
  // typePaths: ['./**/*.graphql'],  // Schema-First alternative
  playground: true,
})
```

**Code-First**: TypeScript decorators (`@ObjectType`, `@Field`) generate SDL schema at runtime.

**Generated schema.gql:**
```graphql
type Query {
  users(paginationInput: PaginationOffsetInput!): PaginationOffsetOutput!
  user(id: String!): UserEntity!
}

type UserEntity {
  id: ID!
  name: String!
  email: String!
  createdAt: DateTime!
  updatedAt: DateTime
}
```

---

## 4. Phase 3: NestJS Resolver Execution

### 4.1 Resolver Discovery at Startup

```
Application Bootstrap
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           Module Scanning (UserModule)               │
│                                                      │
│  providers: [UserResolver, UserService, ...]         │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           Metadata Extraction                        │
│                                                      │
│  @Resolver(() => UserEntity)                         │
│  @Query(() => PaginationOffsetOutput, { name: 'users' })  │
│  @Args('paginationInput')                            │
│                                                      │
│  Stored in: Reflect.getMetadata(...)                │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           GraphQL Schema Binding                     │
│                                                      │
│  "users" query → UserResolver.findManyOffset()      │
└──────────────────────────────────────────────────────┘
```

### 4.2 Resolver Code (user.resolver.ts)

```typescript
@Resolver(() => UserEntity)
export class UserResolver {
  constructor(private readonly userService: UserService) {}  // DI injection

  @Query(() => PaginationOffsetOutput, { name: 'users' })
  async findManyOffset(
    @Args('paginationInput') paginationInput: PaginationOffsetInput,
  ): Promise<PaginationOffsetOutput> {
    return await this.userService.findManyOffset(paginationInput);
  }
}
```

### 4.3 @Args() Parameter Processing

```typescript
// Internal mechanism of @Args decorator
function Args(name: string): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    // Store metadata about this parameter
    Reflect.defineMetadata(
      'graphql:args',
      { name, index: parameterIndex },
      target,
      propertyKey
    );
  };
}

// At execution time:
class ArgsResolver {
  resolve(context: ExecutionContext, metadata: ArgsMetadata) {
    const gqlContext = GqlExecutionContext.create(context);
    const args = gqlContext.getArgs();  // { paginationInput: { page: 1, limit: 10 } }

    const rawValue = args[metadata.name];  // { page: 1, limit: 10 }

    // Transform to class instance
    const transformed = plainToClass(PaginationOffsetInput, rawValue);

    // Validate
    const errors = await validate(transformed);
    if (errors.length > 0) throw new BadRequestException(errors);

    return transformed;
  }
}
```

### 4.4 ValidationPipe Processing

```typescript
// pagination-offset.input.ts
@InputType()
export class PaginationOffsetInput {
  @Field(() => Int, { defaultValue: 1 })
  @Type(() => Number)        // class-transformer: string → number
  @IsInt()                   // class-validator: must be integer
  @Min(1)                    // class-validator: minimum value 1
  page: number;

  @Field(() => Int, { defaultValue: 10 })
  @Type(() => Number)
  @IsInt()
  @IsIn([10, 20, 50, 100])   // class-validator: allowed values only
  limit: number;
}
```

**Validation Flow:**

```
Raw Input: { "page": "1", "limit": "10" }  (strings from JSON)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           class-transformer                          │
│                                                      │
│  @Type(() => Number) transforms:                     │
│  "1" → 1 (number)                                    │
│  "10" → 10 (number)                                  │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           class-validator                            │
│                                                      │
│  @IsInt() → passes (1 is integer)                   │
│  @Min(1) → passes (1 >= 1)                          │
│  @IsIn([10,20,50,100]) → passes (10 in list)        │
└──────────────────────────────────────────────────────┘
       │
       ▼
Validated: PaginationOffsetInput { page: 1, limit: 10 }
```

---

## 5. Phase 4: Service Layer

### 5.1 Service Implementation (user.service.ts)

```typescript
@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findManyOffset(
    paginationInput: PaginationOffsetInput,
  ): Promise<PaginationOffsetOutput> {
    const { page, limit, orderBy } = paginationInput;

    // Repository method call
    const [users, totalCount] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,   // page=1 → skip=0
      take: limit,                // take=10
      order: { ...orderBy },      // e.g., { updatedAt: 'DESC' }
    });

    // Transform to GraphQL entities
    const items = users.map((user) => UserMapper.toEntity(user));

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;

    return { items, totalCount, page, limit, totalPages, hasNextPage };
  }
}
```

### 5.2 Dependency Injection Chain

```
┌──────────────────────────────────────────────────────┐
│                  NestJS DI Container                 │
│                                                      │
│  UserResolver                                        │
│       │                                              │
│       └── @Inject(UserService)                       │
│                  │                                   │
│                  └── @Inject(UserRepository)         │
│                             │                        │
│                             └── @Inject(DataSource)  │
│                                        │             │
│                                        └── Connection Pool  │
└──────────────────────────────────────────────────────┘
```

---

## 6. Phase 5: TypeORM Query Building

### 6.1 Repository Pattern (user.repository.ts)

```typescript
@Injectable()
export class UserRepository extends Repository<UserModel> {
  constructor(private dataSource: DataSource) {
    // Initialize repository with entity metadata
    super(UserModel, dataSource.createEntityManager());
  }
}
```

### 6.2 findAndCount() Internal Flow

```
repository.findAndCount({ skip: 0, take: 10 })
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           EntityManager.findAndCount()               │
│                                                      │
│  1. Get entity metadata for UserModel                │
│  2. Create SelectQueryBuilder                        │
│  3. Apply find options                               │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           SelectQueryBuilder                         │
│                                                      │
│  this.createQueryBuilder(alias)                      │
│      .setFindOptions(options)                        │
│      .getManyAndCount()                              │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           SQL Generation                             │
│                                                      │
│  QueryBuilder.getQuery() → SQL string                │
└──────────────────────────────────────────────────────┘
```

### 6.3 Entity Metadata (Built at Startup)

```typescript
// TypeORM internally stores this metadata
const entityMetadata = {
  name: "UserModel",
  tableName: "users",
  columns: [
    {
      propertyName: "id",
      databaseName: "id",
      type: "uuid",
      isPrimary: true,
    },
    {
      propertyName: "name",
      databaseName: "name",
      type: "varchar",
    },
    {
      propertyName: "email",
      databaseName: "email",
      type: "varchar",
      isUnique: true,
    },
    {
      propertyName: "createdAt",
      databaseName: "createdAt",
      type: "timestamp",
      isCreateDate: true,
    },
    {
      propertyName: "deletedAt",
      databaseName: "deletedAt",
      type: "timestamp",
      isDeleteDate: true,  // Triggers soft delete behavior
    },
  ],
};
```

### 6.4 SQL Generation with Aliases

```typescript
// Simplified QueryBuilder.buildSelectExpression()
class SelectQueryBuilder {
  buildSelectExpression() {
    const alias = this.expressionMap.mainAlias;  // "UserModel"
    const columns = this.expressionMap.metadata.columns;

    return columns.map(column => {
      const columnPath = `"${alias.name}"."${column.databaseName}"`;
      const columnAlias = `"${alias.name}_${column.databaseName}"`;

      return `${columnPath} AS ${columnAlias}`;
    }).join(', ');
  }

  // Result:
  // "UserModel"."id" AS "UserModel_id",
  // "UserModel"."name" AS "UserModel_name",
  // ...
}
```

### 6.5 @DeleteDateColumn() Soft Delete Injection

```typescript
// TypeORM automatically adds this condition
class SelectQueryBuilder {
  applyFindOptions() {
    // Check if entity has @DeleteDateColumn
    const deleteColumn = this.metadata.deleteDateColumn;

    if (deleteColumn && !this.expressionMap.withDeleted) {
      // Automatically add: WHERE deletedAt IS NULL
      this.andWhere(`${this.alias}.${deleteColumn.propertyName} IS NULL`);
    }
  }
}
```

### 6.6 Final Generated SQL

```sql
-- Query for data
SELECT
  "UserModel"."id" AS "UserModel_id",
  "UserModel"."name" AS "UserModel_name",
  "UserModel"."email" AS "UserModel_email",
  "UserModel"."createdAt" AS "UserModel_createdAt",
  "UserModel"."updatedAt" AS "UserModel_updatedAt",
  "UserModel"."deletedAt" AS "UserModel_deletedAt"
FROM "users" "UserModel"
WHERE "UserModel"."deletedAt" IS NULL
LIMIT 10
OFFSET 0

-- Query for count (runs in parallel)
SELECT COUNT(1) AS "cnt"
FROM "users" "UserModel"
WHERE "UserModel"."deletedAt" IS NULL
```

---

## 7. Phase 6: Database Execution

### 7.1 Connection Pool Management

```
┌──────────────────────────────────────────────────────┐
│              TypeORM DataSource                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │            Connection Pool (pg-pool)           │ │
│  │                                                │ │
│  │   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │ │
│  │   │Conn 1│ │Conn 2│ │Conn 3│ │Conn 4│  ...   │ │
│  │   │(busy)│ │(idle)│ │(idle)│ │(busy)│        │ │
│  │   └──────┘ └──────┘ └──────┘ └──────┘        │ │
│  │                                                │ │
│  │   Pool Config:                                │ │
│  │   - max: 10 (default)                         │ │
│  │   - idleTimeoutMillis: 30000                  │ │
│  │   - connectionTimeoutMillis: 2000             │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 7.2 Query Execution Flow

```
TypeORM QueryRunner
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  1. Acquire connection from pool                     │
│                                                      │
│  const connection = await pool.connect();            │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  2. Execute SQL via pg driver                        │
│                                                      │
│  const result = await connection.query(sql, params); │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  3. Release connection back to pool                  │
│                                                      │
│  connection.release();                               │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  4. Return raw result rows                           │
│                                                      │
│  [{                                                  │
│    UserModel_id: "550e8400-e29b-...",               │
│    UserModel_name: "John Doe",                       │
│    UserModel_email: "john@example.com",              │
│    UserModel_createdAt: 2024-01-15T10:30:00.000Z,   │
│    ...                                               │
│  }, ...]                                             │
└──────────────────────────────────────────────────────┘
```

### 7.3 PostgreSQL Wire Protocol

```
┌─────────────────┐                    ┌─────────────────┐
│   Node.js       │                    │   PostgreSQL    │
│   (pg driver)   │                    │    Server       │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │  ──── Query Message ────────────►   │
         │  (SQL string + parameters)          │
         │                                      │
         │  ◄─── RowDescription ───────────    │
         │  (column names, types, formats)     │
         │                                      │
         │  ◄─── DataRow ──────────────────    │
         │  (actual row data, binary/text)     │
         │                                      │
         │  ◄─── DataRow ──────────────────    │
         │  (repeat for each row)              │
         │                                      │
         │  ◄─── CommandComplete ──────────    │
         │  (SELECT 10)                        │
         │                                      │
         │  ◄─── ReadyForQuery ────────────    │
         │  (transaction status)               │
         │                                      │
```

---

## 8. Phase 7: Entity Hydration

### 8.1 Raw Results to Entity Transformation

```
Raw SQL Result Row:
{
  UserModel_id: "550e8400-e29b-41d4-a716-446655440000",
  UserModel_name: "John Doe",
  UserModel_email: "john@example.com",
  UserModel_createdAt: "2024-01-15T10:30:00.000Z",
  UserModel_updatedAt: null,
  UserModel_deletedAt: null
}
       │
       ▼
┌──────────────────────────────────────────────────────┐
│       RawSqlResultsToEntityTransformer               │
└──────────────────────────────────────────────────────┘
       │
       ▼
Hydrated Entity:
UserModel {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "John Doe",
  email: "john@example.com",
  createdAt: Date(2024-01-15T10:30:00.000Z),
  updatedAt: null,
  deletedAt: null
}
```

### 8.2 Hydration Algorithm (Simplified)

```typescript
class RawSqlResultsToEntityTransformer {
  transform(rawResults: any[], alias: Alias): Entity[] {
    const entities: Entity[] = [];
    const identityMap = new Map<string, Entity>();

    for (const rawRow of rawResults) {
      // 1. Extract primary key to check identity map
      const pkColumn = alias.metadata.primaryColumns[0];
      const pkAlias = `${alias.name}_${pkColumn.databaseName}`;
      const pkValue = rawRow[pkAlias];

      // 2. Check if entity already exists (for JOIN deduplication)
      const identityKey = `${alias.name}_${pkValue}`;
      if (identityMap.has(identityKey)) {
        entities.push(identityMap.get(identityKey)!);
        continue;
      }

      // 3. Create new entity instance
      const entity = new alias.metadata.target();

      // 4. Populate each column
      for (const column of alias.metadata.columns) {
        const columnAlias = `${alias.name}_${column.databaseName}`;
        const rawValue = rawRow[columnAlias];

        // 5. Apply type transformation
        const transformedValue = this.transformValue(rawValue, column);

        // 6. Set property on entity
        entity[column.propertyName] = transformedValue;
      }

      // 7. Store in identity map and result array
      identityMap.set(identityKey, entity);
      entities.push(entity);
    }

    return entities;
  }

  transformValue(rawValue: any, column: ColumnMetadata): any {
    if (rawValue === null) return null;

    // Type-specific transformations
    switch (column.type) {
      case 'timestamp':
      case 'timestamptz':
        return new Date(rawValue);

      case 'json':
      case 'jsonb':
        return typeof rawValue === 'string'
          ? JSON.parse(rawValue)
          : rawValue;

      case 'boolean':
        return rawValue === true || rawValue === 1 || rawValue === 't';

      default:
        return rawValue;
    }
  }
}
```

### 8.3 Alias Resolution Pattern

```
Column Alias: "UserModel_createdAt"
                    │
                    ▼
         Split by underscore pattern
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   Alias: "UserModel"      Column: "createdAt"
        │                       │
        ▼                       ▼
   EntityMetadata          ColumnMetadata
   (UserModel class)       (createdAt property)
```

**Why underscores?**

For nested relations, the pattern extends:
```
"User_posts_comments_author_id"
   │     │       │       │
   │     │       │       └── column name
   │     │       └── relation alias
   │     └── relation alias
   └── root entity alias
```

---

## 9. Phase 8: Response Transformation

### 9.1 Entity Mapper (user.mapper.ts)

```typescript
export class UserMapper {
  static toEntity(model: UserModel): UserEntity {
    return new UserEntity({
      id: model.id.toString(),
      name: model.name,
      email: model.email,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
    // Note: deletedAt is NOT mapped (not in GraphQL schema)
  }
}
```

### 9.2 Service Response Construction

```typescript
// In UserService.findManyOffset()
const items = users.map((user) => UserMapper.toEntity(user));

return {
  items,            // UserEntity[]
  totalCount,       // number (from COUNT query)
  page,             // number (from input)
  limit,            // number (from input)
  totalPages,       // Math.ceil(totalCount / limit)
  hasNextPage,      // page < totalPages
};
```

### 9.3 GraphQL Field Resolution

```
PaginationOffsetOutput (TypeScript object)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           GraphQL Executor Field Resolution          │
│                                                      │
│  For each field in selection set:                    │
│                                                      │
│  Client requested: { items { id name } }             │
│                                                      │
│  "items" → resolve → calls UserEntity resolver       │
│     "id" → resolve → returns entity.id               │
│     "name" → resolve → returns entity.name           │
│     "email" → NOT REQUESTED (skipped)                │
│     "createdAt" → NOT REQUESTED (skipped)            │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           JSON Serialization                         │
│                                                      │
│  {                                                   │
│    "data": {                                         │
│      "users": {                                      │
│        "items": [                                    │
│          { "id": "550e8400...", "name": "John" }    │
│        ],                                            │
│        "totalCount": 100,                            │
│        ...                                           │
│      }                                               │
│    }                                                 │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

### 9.4 Response Serialization Path

```
Resolver Return Value
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           GraphQL Coercion                           │
│                                                      │
│  Scalar types → serialize()                          │
│  - ID → String                                       │
│  - DateTime → ISO string                             │
│  - Int → number                                      │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           Apollo Response Formatting                 │
│                                                      │
│  Wrap in { data: { ... } }                          │
│  Add errors array if any                             │
│  Add extensions if configured                        │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│           HTTP Response                              │
│                                                      │
│  Content-Type: application/json                      │
│  Status: 200 OK                                      │
│  Body: JSON.stringify(response)                      │
└──────────────────────────────────────────────────────┘
```

---

## 10. Code Path Trace

### 10.1 File-by-File Execution Order

| Order | File | Function/Method | Purpose |
|-------|------|-----------------|---------|
| 1 | `main.ts:7-22` | `bootstrap()` | App initialization |
| 2 | `app.module.ts:16-41` | `AppModule` | Module registration |
| 3 | `user.resolver.ts:22-27` | `findManyOffset()` | GraphQL resolver |
| 4 | `user.service.ts:57-70` | `findManyOffset()` | Business logic |
| 5 | `user.repository.ts:6-9` | Repository | Database access |
| 6 | `user.model.ts:13-39` | `UserModel` | Entity definition |
| 7 | `user.mapper.ts:5-7` | `toEntity()` | Model→Entity conversion |
| 8 | `user.entity.ts:4-23` | `UserEntity` | GraphQL output type |
| 9 | `pagination-offset.output.ts:4-23` | `PaginationOffsetOutput` | Response structure |

### 10.2 Complete Request Timeline

```
T+0ms    HTTP POST /graphql received
T+1ms    Body parsed, GraphQL query extracted
T+2ms    Query lexed and parsed to AST
T+3ms    AST validated against schema
T+4ms    Resolver lookup: "users" → UserResolver.findManyOffset
T+5ms    @Args('paginationInput') extracted and validated
T+6ms    UserService.findManyOffset() called
T+7ms    TypeORM QueryBuilder constructs SQL
T+8ms    Connection acquired from pool
T+10ms   SQL sent to PostgreSQL
T+15ms   PostgreSQL returns result set
T+16ms   Connection released to pool
T+17ms   Raw results hydrated to UserModel[]
T+18ms   UserMapper transforms to UserEntity[]
T+19ms   Response object constructed
T+20ms   GraphQL field selection applied
T+21ms   JSON serialized and sent
```

---

## Summary

The full lifecycle involves 8 distinct phases:

1. **HTTP Reception**: Express receives POST /graphql
2. **GraphQL Processing**: Apollo parses, validates, and plans execution
3. **Resolver Execution**: NestJS DI injects dependencies, ValidationPipe processes args
4. **Service Layer**: Business logic coordinates data access
5. **Query Building**: TypeORM constructs SQL with entity metadata
6. **Database Execution**: Connection pool manages PostgreSQL communication
7. **Entity Hydration**: Alias-prefixed columns map back to entity properties
8. **Response Transformation**: Entities convert to GraphQL types, fields filtered by selection

The key insight is that **each layer has its own data representation**:
- HTTP: JSON string
- GraphQL: AST → resolved values
- Service: DTOs and business objects
- TypeORM: Entity instances
- Database: Rows with aliased columns

Each transformation is reversible and deterministic, enabled by **metadata stored at application startup** (decorators → reflection → registries).
