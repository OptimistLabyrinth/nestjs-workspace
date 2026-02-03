# What Does `NestFactory.create(AppModule)` Do?

This single line triggers a complex bootstrapping process that initializes the entire NestJS application.

```typescript
const app = await NestFactory.create(AppModule);
```

---

## 1. NestFactory.create() Entry Point

```typescript
static async create<T extends INestApplication>(
  module: any,
  serverOrOptions?: AbstractHttpAdapter | NestApplicationOptions,
  options?: NestApplicationOptions,
): Promise<T>
```

The static method accepts:
- **module**: Your root module class (AppModule)
- **serverOrOptions**: Optional HTTP adapter (defaults to Express) or application options
- **options**: Additional configuration options

---

## 2. HTTP Adapter Selection

NestJS determines which HTTP platform to use:

| Adapter | Package                      | Default |
|---------|------------------------------|---------|
| Express | @nestjs/platform-express     | Yes     |
| Fastify | @nestjs/platform-fastify     | No      |

If no adapter is specified, NestJS instantiates ExpressAdapter which wraps the Express.js framework.

---

## 3. NestContainer Initialization

The Dependency Injection (DI) Container is created:

```
NestContainer
├── ModulesContainer (Map<string, Module>)
├── ModuleTokenFactory
├── ModuleCompiler
└── InternalCoreModule
```

This container will hold:
- All module instances
- All provider instances
- Dependency relationships
- Injection tokens

---

## 4. Module Scanning Phase

The DependenciesScanner recursively scans your module tree:

```
AppModule
├── ConfigModule.forRoot(...)
├── TypeOrmModule.forRootAsync(...)
├── GraphQLModule.forRoot(...)
└── UserModule
    └── (nested modules, controllers, providers)
```

For each module, it extracts:
- **imports** → Other modules to load
- **controllers** → Request handlers
- **providers** → Injectable services
- **exports** → Providers available to importing modules

---

## 5. Metadata Resolution

Using Reflect Metadata API, NestJS reads decorators:

```typescript
@Module({...})        → Reflect.getMetadata('imports', AppModule)
@Injectable()         → Marks class for DI
@Controller()         → Marks class as HTTP controller
@Inject()             → Explicit injection token
```

Decorator metadata stored:
- `PARAMTYPES_METADATA` → Constructor parameter types
- `SELF_DECLARED_DEPS_METADATA` → @Inject() tokens
- `OPTIONAL_DEPS_METADATA` → @Optional() markers

---

## 6. Dynamic Module Resolution

For dynamic modules like ConfigModule.forRoot():

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: `.env...`,
  load: [appConfig, postgresConfig],
})
```

NestJS calls the static method which returns:

```typescript
{
  module: ConfigModule,
  providers: [...],
  exports: [...],
  global: true,  // Available everywhere without importing
}
```

---

## 7. Async Module Factories

For TypeOrmModule.forRootAsync():

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config) => config,
})
```

Process:
1. Registers a deferred provider
2. Waits for ConfigModule to initialize
3. Resolves ConfigService from container
4. Invokes useFactory with injected dependencies
5. Uses returned config to create TypeORM connection

---

## 8. Provider Registration

Each provider goes through registration:

```
Provider Types:
├── Class Provider      → { provide: Token, useClass: SomeClass }
├── Value Provider      → { provide: Token, useValue: someValue }
├── Factory Provider    → { provide: Token, useFactory: () => {...} }
└── Existing Provider   → { provide: Token, useExisting: OtherToken }
```

For AppService:
```typescript
@Injectable()
export class AppService { }
```

Becomes internally:
```typescript
{ provide: AppService, useClass: AppService }
```

---

## 9. Dependency Graph Construction

The Injector builds a directed acyclic graph (DAG):

```
AppController
    └── depends on → AppService
                         └── depends on → (nothing)

UserController
    └── depends on → UserService
                         └── depends on → TypeOrmRepository<User>
                                              └── depends on → DataSource
```

Cycle detection prevents circular dependencies (throws error if found).

---

## 10. Instance Creation (Topological Order)

Providers are instantiated bottom-up:

1. ConfigService (leaf node, no deps)
2. DataSource (depends on ConfigService)
3. Repository<User> (depends on DataSource)
4. UserService (depends on Repository)
5. UserController (depends on UserService)

Each instance is cached as singleton (default scope).

---

## 11. Controller Route Registration

For each @Controller:

```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  findOne(@Param('id') id: string) { }
}
```

NestJS:
1. Reads @Controller('users') → base path /users
2. Reads @Get(':id') → HTTP method + path
3. Extracts parameter decorators (@Param, @Body, etc.)
4. Registers route with HTTP adapter: router.get('/users/:id', handler)

---

## 12. Middleware Pipeline Setup

Request Flow:
```
┌─────────────────────────────────────────────────────────────┐
│  Express/Fastify                                            │
│    ↓                                                        │
│  Global Middleware                                          │
│    ↓                                                        │
│  Module Middleware (configure() method)                     │
│    ↓                                                        │
│  Guards (@UseGuards)                                        │
│    ↓                                                        │
│  Interceptors - Before (@UseInterceptors)                   │
│    ↓                                                        │
│  Pipes (@UsePipes, ValidationPipe)                          │
│    ↓                                                        │
│  Controller Method                                          │
│    ↓                                                        │
│  Interceptors - After                                       │
│    ↓                                                        │
│  Exception Filters (@UseFilters)                            │
│    ↓                                                        │
│  Response                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. Lifecycle Hooks Execution

After instantiation, lifecycle hooks fire in order:

| Hook                      | When                                    |
|---------------------------|-----------------------------------------|
| onModuleInit()            | After module's dependencies resolved    |
| onApplicationBootstrap()  | After all modules initialized           |

```typescript
@Injectable()
export class SomeService implements OnModuleInit {
  async onModuleInit() {
    // Called automatically after DI complete
  }
}
```

---

## 14. INestApplication Creation

Finally, create() returns an INestApplication instance:

```typescript
interface INestApplication {
  use(...);                    // Global middleware
  useGlobalPipes(...);         // Global pipes (like ValidationPipe)
  useGlobalFilters(...);       // Global exception filters
  useGlobalGuards(...);        // Global guards
  useGlobalInterceptors(...);  // Global interceptors
  listen(port);                // Start HTTP server
  // ... more methods
}
```

---

## 15. What AppModule Specifically Triggers

Given this app.module.ts:

```
NestFactory.create(AppModule)
│
├─→ ConfigModule.forRoot()
│   ├─→ Loads .env file based on NODE_ENV
│   ├─→ Creates ConfigService (global)
│   └─→ Registers appConfig, postgresConfig factories
│
├─→ TypeOrmModule.forRootAsync()
│   ├─→ Waits for ConfigService
│   ├─→ Calls useFactory with config
│   ├─→ Creates DataSource connection to PostgreSQL
│   └─→ Registers Repository providers
│
├─→ GraphQLModule.forRoot()
│   ├─→ Initializes Apollo Server
│   ├─→ Scans for @Resolver decorators
│   ├─→ Generates schema.gql (Code-First)
│   └─→ Mounts /graphql endpoint
│
├─→ UserModule
│   └─→ Registers User-related controllers/services
│
├─→ AppController
│   └─→ Registers root routes
│
└─→ AppService
    └─→ Instantiated and injected into AppController
```

---

## Summary

NestFactory.create(AppModule) performs:

1. Platform initialization (Express/Fastify)
2. DI container creation
3. Recursive module scanning
4. Metadata extraction via Reflect API
5. Dynamic module resolution
6. Dependency graph construction
7. Topological instantiation of all providers
8. Route registration for controllers
9. Middleware/Guard/Interceptor pipeline setup
10. Lifecycle hook execution
11. Returns configured application instance

The entire process typically completes in milliseconds for small apps, but can take seconds for large applications with database connections and complex module graphs.
