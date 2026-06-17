# Industrial Asset & Maintenance SaaS

> **Project #1** — Fullstack portfolio project for Kazakhstan IT job market.  
> **Concept:** B2B SaaS for tracking industrial equipment, scheduling maintenance, managing spare parts inventory, and running QR-based inspections.  
> **Goal:** Demonstrate modern fullstack skills, clean architecture, testing, and DevOps — without over-engineering.  
> **Budget:** $0 (all core services have free tiers).  
> **Timeline:** 10–12 weeks (realistic for one person with AI assistance; the original 6–8 week estimate was optimistic — debugging, integration, deployment and polish eat the difference).  
> **Status:** Ready for implementation.

---

## 1. Why This Project?

### Problem
Small and medium industrial companies in Kazakhstan still track equipment in Excel. Maintenance is forgotten, spare parts run out unexpectedly, and there is no history of breakdowns or repairs.

### Solution
A focused SaaS platform where a company can:
1. Register equipment, locations, and categories.
2. Generate QR codes for each asset.
3. Schedule and track maintenance work orders.
4. Run QR-based inspections with checklists.
5. Manage a simple spare parts inventory.
6. View a dashboard with KPIs and analytics.

### Why It Is Not Trivial
- Real B2B domain with actual workflows.
- Complex relational data model (locations → assets → work orders → inspections).
- QR code generation and scanning in the browser.
- Role-based access control.
- Dashboard with real analytics.
- Full CI/CD, tests, and Docker setup.

### Why It Is Realistic
- No AI dependencies.
- No VR integration.
- No real-time WebSocket complexity (basic notifications via UI polling).
- Single-tenant MVP (one company per deployment) — multi-tenancy can be added later.
- 10–12 weeks timeline for a focused, tested MVP (2-week buffer included).

---

## 2. Target Job Market

This project targets employers in Kazakhstan looking for:

| Requirement | How This Project Covers It |
|-------------|----------------------------|
| React + TypeScript | Next.js 14 + React + TypeScript frontend |
| REST API | NestJS REST API with OpenAPI/Swagger |
| PostgreSQL | PostgreSQL 16 + Prisma ORM |
| Git | GitHub repo with structured commits |
| OOP / Clean Code | NestJS services, modules, DTOs, repositories |
| Testing | Vitest, Playwright, React Testing Library |
| Docker | Docker Compose for local development |
| CI/CD | GitHub Actions pipeline |
| Fullstack experience | Complete frontend + backend + database |

Expected salary positioning with this project:
- **Junior+ / Middle-** in Kazakhstan: 400,000 – 700,000 KZT
- With strong explanation and clean code: up to middle-level opportunities

---

## 3. Technology Stack

### Frontend
| Technology | Role |
|------------|------|
| **Next.js 14** (App Router) | React framework with SSR/API routes |
| **React 18** | UI library |
| **TypeScript 5** | Static typing |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Copy-paste accessible components |
| **TanStack Query v5** | Server state caching |
| **Zustand** | Client state management |
| **React Hook Form + Zod** | Forms and validation |
| **Recharts** | Dashboard charts |
| **qrcode.react + html5-qrcode** | QR generation and scanning |

### Backend
| Technology | Role |
|------------|------|
| **NestJS 10** | Modular Node.js framework |
| **TypeScript** | Shared language with frontend |
| **Prisma ORM** | Type-safe database access |
| **PostgreSQL 16** | Relational database |
| **Redis 7** | BullMQ queue, refresh-token revocation list, rate-limit counter (JWT itself stays stateless) |
| **JWT + Passport.js** | Authentication and authorization |
| **BullMQ** | Background jobs (report generation) |
| **Pino** | Structured logging |

### DevOps / QA
| Technology | Role |
|------------|------|
| **Docker + Docker Compose** | Local development environment |
| **GitHub Actions** | CI/CD: lint, typecheck, test, build |
| **Vitest** | Unit and integration tests |
| **Playwright** | End-to-end tests |
| **React Testing Library** | Frontend component tests |
| **Swagger / OpenAPI** | API documentation |

### Deployment (Free Tiers)
| Service | Role |
|---------|------|
| **Vercel** | Frontend hosting |
| **Render** | Backend + PostgreSQL hosting |
| **Upstash Redis** | Free managed Redis |
| **Cloudflare R2** | Free object storage for generated reports (CSV) |
| **GitHub** | Repository + Actions |

---

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│              Vercel / Local                 │
│  ┌─────────────────────────────────────┐    │
│  │      Next.js 14 (App Router)        │    │
│  │  ┌─────────────┐  ┌─────────────┐   │    │
  │  │  │    Pages    │  │   Server    │   │    │
  │  │  │   (React)   │  │ Components  │   │    │
│  │  └──────┬──────┘  └──────┬──────┘   │    │
│  │         │                │          │    │
│  │         ▼                ▼          │    │
│  │   TanStack Query      REST API      │    │
│  └─────────┬────────────────┬───────────┘    │
└────────────┼────────────────┼────────────────┘
             │                │
             ▼                ▼
┌─────────────────────────────────────────────┐
│            Render / Local (Docker)          │
│  ┌─────────────────────────────────────┐    │
│  │           NestJS 10 API             │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐   │    │
│  │  │  Auth  │ │ Assets │ │ Work   │   │    │
│  │  │        │ │        │ │ Orders │   │    │
│  │  └────────┘ └────────┘ └────────┘   │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐   │    │
│  │  │Inspection│ │ Parts  │ │ Reports│   │    │
│  │  │        │ │        │ │        │   │    │
│  │  └────────┘ └────────┘ └────────┘   │    │
│  └──────┬───────────────────┬──────────┘    │
│         │                   │               │
│         ▼                   ▼               │
│  ┌────────────┐    ┌──────────────┐         │
│  │ PostgreSQL │    │    Redis     │         │
│  │  (Prisma)  │    │(Sessions/Cache)│        │
│  └────────────┘    └──────────────┘         │
└─────────────────────────────────────────────┘
```

### Architectural Principles
1. **Single Responsibility:** each NestJS module handles one domain.
2. **Layered Architecture:** Controller → Service → Repository (Prisma).
3. **DTO-First:** shared types between frontend and backend.
4. **Direct API calls:** the Next.js client calls the NestJS API directly over HTTPS (CORS enabled). Next.js Route Handlers are **not** used as a proxy/BFF — that would double latency and add serverless complexity for no MVP benefit.
5. **No Over-Engineering:** no WebSocket, no AI, no multi-tenancy in MVP.
6. **Background Jobs:** only for report generation via BullMQ.
7. **Audit-friendly:** work orders and parts use soft-delete / movement rows so history is never lost.

---

## 5. Domain Model

### Entities

1. **Company** (single company in MVP)
   - id, name, createdAt

2. **User**
   - id, email, password, firstName, lastName, role, createdAt
   - Roles: `admin`, `manager`, `technician`, `viewer`

3. **Location**
   - id, name, description, companyId
   - Example: "Workshop 1", "Warehouse A"

4. **Category**
   - id, name, description, companyId
   - Example: "Pumps", "Compressors", "Electrical"

5. **Asset** (equipment)
   - id, name, description, serialNumber, qrCode, status, locationId, categoryId, companyId, purchaseDate, warrantyDate, createdAt
   - Status: `active`, `maintenance`, `retired`

6. **WorkOrder**
   - id, title, description, type, status, priority, assetId, assignedToId, dueDate, completedAt, companyId, createdAt
   - Type: `preventive`, `corrective`, `inspection`
   - Status: `open`, `in_progress`, `on_hold`, `completed`, `cancelled`
   - Priority: `low`, `medium`, `high`, `critical`

7. **Inspection**
   - id, assetId, templateId, results (JSON), passed, notes, inspectedById, companyId, createdAt

8. **InspectionTemplate**
   - id, name, items (JSON), companyId, createdAt

9. **Part**
   - id, name, sku, description, quantity, minQuantity, companyId, createdAt
   - Stock decreases automatically when parts are consumed by work orders (see `WorkOrderPart`). Restocking reverses the movement.

10. **WorkOrderPart** (parts consumption — links work orders to parts)
    - id, workOrderId, partId, quantity, createdAt
    - Creating a row decrements `Part.quantity` (transactional); deleting the row restocks it back.
    - This is what makes the inventory "run out unexpectedly" problem actually modelled by the system.

11. **Report**
    - id, type, status, fileUrl, storageKey, companyId, createdAt
    - Status: `pending`, `completed`, `failed`
    - Generated files are stored in object storage (Cloudflare R2); `fileUrl` is a presigned/CDN URL, `storageKey` is the R2 object key.

12. **Notification**
    - id, userId, title, message, read, createdAt

---

## 6. Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  admin
  manager
  technician
  viewer
}

enum AssetStatus {
  active
  maintenance
  retired
}

enum WorkOrderType {
  preventive
  corrective
  inspection
}

enum WorkOrderStatus {
  open
  in_progress
  on_hold
  completed
  cancelled
}

enum Priority {
  low
  medium
  high
  critical
}

enum ReportStatus {
  pending
  completed
  failed
}

model Company {
  id           String        @id @default(uuid())
  name         String
  createdAt    DateTime      @default(now())
  users        User[]
  locations    Location[]
  categories   Category[]
  assets       Asset[]
  workOrders   WorkOrder[]
  inspections  Inspection[]
  templates    InspectionTemplate[]
  parts        Part[]
  reports      Report[]
  notifications Notification[]
}

model User {
  id            String        @id @default(uuid())
  email         String        @unique
  password      String
  firstName     String
  lastName      String
  role          UserRole      @default(viewer)
  companyId     String
  company       Company       @relation(fields: [companyId], references: [id])
  assignedOrders WorkOrder[]  @relation("AssignedTo")
  inspections   Inspection[]
  notifications Notification[]
  createdAt     DateTime      @default(now())
}

model Location {
  id          String   @id @default(uuid())
  name        String
  description String?
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  assets      Asset[]
}

model Category {
  id          String   @id @default(uuid())
  name        String
  description String?
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  assets      Asset[]
}

model Asset {
  id            String        @id @default(uuid())
  name          String
  description   String?
  serialNumber  String?
  qrCode        String        @unique
  status        AssetStatus   @default(active)
  purchaseDate  DateTime?
  warrantyDate  DateTime?
  locationId    String
  location      Location      @relation(fields: [locationId], references: [id])
  categoryId    String
  category      Category      @relation(fields: [categoryId], references: [id])
  companyId     String
  company       Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  workOrders    WorkOrder[]
  inspections   Inspection[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model WorkOrder {
  id            String           @id @default(uuid())
  title         String
  description   String?
  type          WorkOrderType
  status        WorkOrderStatus  @default(open)
  priority      Priority         @default(medium)
  assetId       String
  asset         Asset            @relation(fields: [assetId], references: [id])
  assignedToId  String?
  assignedTo    User?            @relation("AssignedTo", fields: [assignedToId], references: [id])
  dueDate       DateTime?
  completedAt   DateTime?
  companyId     String
  company       Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  parts         WorkOrderPart[]  @relation("WorkOrderParts")
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  deletedAt     DateTime?
}

model InspectionTemplate {
  id          String   @id @default(uuid())
  name        String
  items       Json
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  inspections Inspection[]
  createdAt   DateTime @default(now())
}

model Inspection {
  id          String             @id @default(uuid())
  assetId     String
  asset       Asset              @relation(fields: [assetId], references: [id])
  templateId  String
  template    InspectionTemplate @relation(fields: [templateId], references: [id])
  results     Json
  passed      Boolean
  notes       String?
  inspectedById String
  inspectedBy User               @relation(fields: [inspectedById], references: [id])
  companyId   String
  company     Company            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdAt   DateTime           @default(now())
}

model Part {
  id           String          @id @default(uuid())
  name         String
  sku          String
  description  String?
  quantity     Int             @default(0)
  minQuantity  Int             @default(0)
  companyId    String
  company      Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  workOrderParts WorkOrderPart[]
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  @@unique([companyId, sku])
}

model WorkOrderPart {
  id          String    @id @default(uuid())
  workOrderId String
  workOrder   WorkOrder @relation("WorkOrderParts", fields: [workOrderId], references: [id], onDelete: Cascade)
  partId      String
  part        Part      @relation(fields: [partId], references: [id], onDelete: Cascade)
  quantity    Int
  createdAt   DateTime  @default(now())

  @@unique([workOrderId, partId])
}

model Report {
  id        String       @id @default(uuid())
  type      String
  status    ReportStatus @default(pending)
  fileUrl   String?
  storageKey String?
  companyId String
  company   Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdAt DateTime     @default(now())
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

---

## 7. Backend Modules & API

### 7.1. `auth`
**Endpoints:**
- `POST /auth/register` — register company + first admin
- `POST /auth/login` — login, returns `{ accessToken, refreshToken, user }`
- `POST /auth/refresh` — refresh access token
- `GET /auth/me` — current user

**Features:**
- Password hashing with bcrypt.
- JWT access + refresh tokens.
- Passport JWT strategy.
- Role-based `@Roles()` decorator + `RolesGuard`.

### 7.2. `users`
**Endpoints:**
- `GET /users` — list users (admin/manager)
- `POST /users` — create user (admin/manager)
- `PATCH /users/:id/role` — change role (admin)

### 7.3. `locations`
**Endpoints:**
- `CRUD /locations`

### 7.4. `categories`
**Endpoints:**
- `CRUD /categories`

### 7.5. `assets` (CORE)
**Endpoints:**
- `GET /assets` — list with filters (status, location, category, search)
- `GET /assets/:id` — details
- `POST /assets` — create
- `PATCH /assets/:id` — update
- `DELETE /assets/:id` — delete
- `GET /assets/:id/qr` — generate QR code SVG/PNG
- `GET /assets/qr/:qrCode` — find asset by QR code

**QR Logic:**
- QR code contains an **opaque, random token** (e.g. 24-byte base32), stored in `Asset.qrCode @unique` — **not** the asset UUID, which is enumerable.
- The token is mapped to the asset only server-side (`GET /assets/qr/:token`), so a leaked QR grants access to one asset, not the whole list.
- Generated on asset creation; can be rotated (invalidates the old printed sticker).

### 7.6. `work-orders` (CORE)
**Endpoints:**
- `GET /work-orders` — list with filters
- `GET /work-orders/:id`
- `POST /work-orders` — create
- `PATCH /work-orders/:id` — update
- `PATCH /work-orders/:id/status` — status transition
- `DELETE /work-orders/:id` — soft-delete (sets `deletedAt`), never removes audit history
- `GET /work-orders/:id/parts` — list parts consumed by this order
- `POST /work-orders/:id/parts` — consume parts (decrements `Part.quantity` in a transaction)
- `DELETE /work-orders/:id/parts/:partId` — remove usage (restocks `Part.quantity`)

**Validation:**
- Status transitions must be valid (e.g., `open` → `in_progress`, not `open` → `completed` directly).
- `completedAt` set automatically on status `completed`.
- Parts consumption rejects if requested `quantity` exceeds available `Part.quantity`.

### 7.7. `inspections`
**Endpoints:**
- `GET /inspections` — list
- `GET /inspections/:id`
- `POST /inspections` — submit inspection
- `GET /inspections/templates` — list templates
- `POST /inspections/templates` — create template

**Logic:**
- Template items stored as JSON: `[{ label: "Check oil level", type: "pass_fail" }]`.
- Inspection results: `[{ itemId: "...", value: "pass" }]`.
- `passed` = true only if all items passed.

### 7.8. `parts`
**Endpoints:**
- `CRUD /parts`
- `POST /parts/:id/restock` — increase `quantity` (manual restock)
- `GET /parts/low-stock` — parts where `quantity <= minQuantity`

**Logic:**
- `quantity` is the single source of truth and changes only via `WorkOrderPart` (consumption) or restock — never edited directly, to keep an auditable movement history.
- Low-stock notifications are triggered on the consumption that crosses the threshold.

### 7.9. `reports`
**Endpoints:**
- `POST /reports` — generate report (BullMQ job)
- `GET /reports` — list
- `GET /reports/:id/download` — redirect to a short-lived presigned R2 URL (or stream the file)

**Report Types:**
- `assets` — all assets CSV
- `work_orders` — work orders CSV
- `low_stock` — low stock parts CSV

**Storage:**
- Generated files are uploaded to **Cloudflare R2** (free tier, 10 GB) by the BullMQ worker. `storageKey` holds the R2 object key, `fileUrl` holds a presigned URL. Render's ephemeral disk is **not** used for persistence — files would disappear on redeploy.

### 7.10. `dashboard`
**Endpoints:**
- `GET /dashboard/stats` — KPIs:
  - total assets
  - assets in maintenance
  - open work orders
  - overdue work orders
  - low stock parts
  - inspections this month
- `GET /dashboard/trends` — data for charts:
  - work orders by month
  - work orders by status
  - work orders by priority

### 7.11. `notifications`
**Endpoints:**
- `GET /notifications` — list
- `PATCH /notifications/:id/read` — mark as read
- `PATCH /notifications/read-all` — mark all as read

**Auto-creation rules:**
- Critical work order created → notify admins/managers.
- Work order overdue → notify assignee + manager.
- Part low stock → notify admins/managers.

---

## 8. Frontend Pages & Components

### Pages
```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (dashboard)/
│   ├── layout.tsx              # sidebar + header
│   ├── dashboard/page.tsx      # main dashboard
│   ├── assets/page.tsx         # assets list
│   ├── assets/[id]/page.tsx    # asset detail
│   ├── assets/new/page.tsx     # create asset
│   ├── assets/scan/page.tsx    # QR scanner
│   ├── work-orders/page.tsx    # work orders list
│   ├── work-orders/[id]/page.tsx
│   ├── work-orders/new/page.tsx
│   ├── inspections/page.tsx    # inspections list
│   ├── inspections/new/page.tsx
│   ├── inspections/templates/page.tsx
│   ├── parts/page.tsx          # spare parts inventory
│   ├── reports/page.tsx        # reports
│   ├── locations/page.tsx
│   ├── categories/page.tsx
│   ├── users/page.tsx          # user management (admin)
│   └── settings/page.tsx
```

### Shared Components
- `<AppSidebar />` — navigation
- `<AppHeader />` — header with notifications
- `<DataTable />` — reusable table with sorting/filtering
- `<FormInput />`, `<FormSelect />`, `<FormTextarea />` — form fields
- `<StatusBadge />` — work order status badge
- `<PriorityBadge />` — priority badge
- `<AssetStatusBadge />` — asset status badge
- `<StatsCard />` — dashboard KPI card
- `<TrendChart />` — Recharts bar/line chart
- `<QrCodeDisplay />` — show asset QR code
- `<QrScanner />` — camera-based QR scanner
- `<InspectionForm />` — dynamic checklist form

---

## 9. Implementation Phases

### Phase 0: Foundation (Week 1)
**Goal:** working skeleton.

- [ ] Initialize Turborepo monorepo.
- [ ] Setup `apps/web` (Next.js 14 + Tailwind + shadcn/ui).
- [ ] Setup `apps/api` (NestJS 10).
- [ ] Setup `packages/shared-types`.
- [ ] Create `docker-compose.yml` with PostgreSQL + Redis.
- [ ] Setup environment files (`.env.example`).
- [ ] Setup GitHub Actions CI (lint, typecheck).
- [ ] Write initial README.

**Deliverable:** `docker-compose up` starts everything, both apps respond.

### Phase 1: Authentication (Week 1–2)
**Goal:** users can register and log in.

- [ ] Prisma schema for `Company`, `User`.
- [ ] Auth module: register, login, refresh, me.
- [ ] Password hashing, JWT tokens.
- [ ] Roles decorator and guard.
- [ ] Frontend login/register pages.
- [ ] Auth context/store in Zustand.
- [ ] Protected routes.

**Deliverable:** registration and login work end-to-end.

### Phase 2: Core Reference Data (Week 2)
**Goal:** locations, categories, users.

- [ ] CRUD locations.
- [ ] CRUD categories.
- [ ] CRUD users (admin only).
- [ ] Frontend pages for locations, categories, users.

**Deliverable:** can create locations and categories through UI.

### Phase 3: Assets + QR Codes (Week 3)
**Goal:** equipment register with QR codes.

- [ ] Prisma schema for `Asset`.
- [ ] Asset CRUD backend.
- [ ] QR code generation endpoint.
- [ ] Find asset by QR code endpoint.
- [ ] Asset list/detail pages.
- [ ] Asset creation form.
- [ ] QR code display on asset page.
- [ ] QR scanner page.

**Deliverable:** can create asset, generate QR, scan QR, view asset.

### Phase 4: Work Orders (Week 4)
**Goal:** maintenance workflow.

- [ ] Prisma schema for `WorkOrder`.
- [ ] Work order CRUD backend.
- [ ] Status transition validation.
- [ ] Work order list/detail/create pages.
- [ ] Assign users to work orders.
- [ ] Due date handling.

**Deliverable:** full work order lifecycle through UI.

### Phase 5: Inspections (Week 5)
**Goal:** QR-based inspections with checklists.

- [ ] Prisma schema for `InspectionTemplate`, `Inspection`.
- [ ] Inspection template CRUD.
- [ ] Submit inspection backend.
- [ ] Dynamic checklist form.
- [ ] Link inspection to asset via QR scan.
- [ ] Inspection history page.

**Deliverable:** can scan QR, fill checklist, save inspection.

### Phase 6: Parts Inventory (Week 5–6)
**Goal:** spare parts tracking with real consumption.

- [ ] Prisma schema for `Part` and `WorkOrderPart`.
- [ ] Part CRUD backend + restock endpoint.
- [ ] Parts-consumption endpoints on work orders (transactional stock decrement).
- [ ] Low stock detection (triggered on the consumption that crosses the threshold).
- [ ] Parts page + parts-usage panel on the work order detail page.
- [ ] Low stock alerts.

**Deliverable:** inventory tracking with stock that actually moves as repairs happen.

### Phase 7: Dashboard + Reports (Week 6–7)
**Goal:** analytics and exports.

- [ ] Dashboard stats endpoint.
- [ ] Trends endpoint.
- [ ] Dashboard page with charts.
- [ ] Report generation with BullMQ.
- [ ] Cloudflare R2 integration (upload `storageKey`, expose presigned `fileUrl`).
- [ ] CSV export via presigned download.
- [ ] Reports page.

**Deliverable:** dashboard shows KPIs and charts; reports generate, persist in R2, and download correctly across redeployments.

### Phase 8: Notifications (Week 7)
**Goal:** notify users about important events.

- [ ] Notification model and CRUD.
- [ ] Auto-create notifications on critical events.
- [ ] Notification dropdown in header.
- [ ] Mark as read functionality.

**Deliverable:** users receive notifications.

### Phase 9: Testing + Polish (Week 8–9)
**Goal:** quality assurance.

- [ ] Backend unit/integration tests with Vitest.
- [ ] Frontend component tests with React Testing Library.
- [ ] E2E tests with Playwright (critical paths).
- [ ] Swagger documentation.
- [ ] Error handling and loading states.
- [ ] Form validation edge cases.

**Deliverable:** CI is green, tests pass.

### Phase 10: Deployment + Documentation (Week 10)
**Goal:** project is live and presentable.

- [ ] Deploy frontend to Vercel.
- [ ] Deploy backend + DB to Render.
- [ ] Setup Upstash Redis.
- [ ] Environment variables configuration.
- [ ] Seed demo data.
- [ ] Create demo GIF/screenshots.
- [ ] Final README with architecture, stack, features, setup.

**Deliverable:** live demo link, polished README, ready for portfolio.

### Phase 11: Buffer (Week 11–12)
**Goal:** fix bugs and improve.

- [ ] Bug fixes from manual testing.
- [ ] Mobile responsiveness improvements.
- [ ] Performance optimizations.
- [ ] Additional polish.

---

## 10. Rules for AI Agents

### Code Conventions
1. **NestJS:** one module per folder. Inside: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.dto.ts`.
2. **Next.js:** Server Components by default. Use `'use client'` only when needed (forms, charts, scanner).
3. **Shared Types:** all DTOs live in `packages/shared-types`. Import in both frontend and backend.
4. **Error Handling:** use `HttpException` in NestJS, centralize with exception filter.
5. **Validation:** Zod on frontend, class-validator on backend. Reuse shared types where possible.
6. **Database:** use Prisma transactions for multi-step operations.
7. **Logging:** use Pino in backend. No `console.log` in production code.
8. **Naming:** use English names for files, variables, functions. Comments in English.

### Forbidden
- Do not write all code in one file.
- Do not use `any` type.
- Do not hardcode secrets.
- Do not skip tests for critical paths.
- Do not add features outside the current phase.
- Do not use deprecated libraries.

### Process
1. Agent receives one phase at a time.
2. Agent writes code.
3. Agent runs `pnpm lint`, `pnpm typecheck`, `pnpm test`.
4. Agent explains what was done and any decisions made.
5. Move to the next phase only after confirmation.

---

## 11. Testing Strategy

### Backend Tests (Vitest)
- Unit tests for services.
- Integration tests for controllers.
- **Test against real PostgreSQL** (via `docker-compose` test DB or testcontainers), **not** SQLite — enums, JSON, and `@updatedAt` behave differently across engines and SQLite gives false confidence.

**Example critical paths to test:**
- User registration and login.
- Asset CRUD.
- Work order status transitions.
- Inspection passing logic.
- Low stock detection.

### Frontend Tests (React Testing Library + Vitest)
- Component tests for forms.
- Component tests for badges and cards.
- Hook tests for auth and queries.

### E2E Tests (Playwright)
- Login → create location → create asset → create work order → complete work order.
- Create part → consume it on a work order → verify stock decremented → low-stock alert appears.
- Scan QR → submit inspection.
- Generate report → download CSV (verify presigned R2 URL works).

---

## 12. Deployment Plan

### Local Development
```bash
# Clone repo
cd industrial-asset-maintenance-saas
cp .env.example .env

# Start infrastructure
docker-compose up -d

# Install dependencies
pnpm install

# Run migrations
pnpm --filter api prisma migrate dev

# Seed demo data
pnpm --filter api prisma db seed

# Start dev servers
pnpm dev
```

### Production
1. **Frontend:** connect GitHub repo to Vercel.
2. **Backend:** deploy `apps/api` to Render as Web Service.
3. **Database:** create PostgreSQL on Render.
4. **Cache:** create Redis on Upstash.
5. **Environment variables:** set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, and R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`).

---

## 13. Resume Keywords

After completing this project, you can list:

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form, Zod, Recharts.
- **Backend:** NestJS, Node.js, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, JWT, Passport.js.
- **DevOps/QA:** Docker, Docker Compose, GitHub Actions, Vitest, Playwright, React Testing Library, Swagger/OpenAPI.
- **Domain:** B2B SaaS, asset management, maintenance workflows, QR code integration, inventory management.

---

## 14. Success Criteria

The project is considered complete when:

- [ ] All 11 phases are implemented.
- [ ] CI/CD pipeline is green.
- [ ] At least 70% test coverage for critical paths.
- [ ] E2E tests pass.
- [ ] Deployed and accessible online.
- [ ] README has live demo link, screenshots, and architecture diagram.
- [ ] You can explain every major technical decision in an interview.

---

## 15. Notes

- **No AI required.** This project intentionally avoids AI to reduce cost and complexity. AI can be added later as a separate feature.
- **No real-time WebSocket.** Notifications use REST polling to keep the stack simple. WebSocket can be added later.
- **Single-tenant MVP.** Each deployment serves one company. Multi-tenancy is a future enhancement.
- **Focus on quality over quantity.** A smaller, polished project is better than a large, broken one.

### 15.1 Documented Decisions & Tradeoffs

- **`Company` is kept despite single-tenancy.** Every entity carries `companyId` so multi-tenancy can be enabled later by turning the column into a real tenant key + RLS. Cost: one extra FK + filter on each query today. This is a deliberate forward-investment, **not** accidental over-engineering.
- **JWT stays stateless; Redis is for ops, not sessions.** Access/refresh tokens are JWT. Redis is used only for: BullMQ queues, a refresh-token revocation list (logout/rotate), and a rate-limit counter. There is no server-side session store — this keeps horizontal scaling simple.
- **Tests run on real PostgreSQL.** SQLite was considered for speed but rejected because enum/JSON/`@updatedAt` semantics diverge and produce false-green tests. CI spins up Postgres in a service container.
- **Coverage target is path-based, not a vanity number.** 70% is a floor; the real gate is that every critical path is tested (auth, status transitions, parts consumption/stock, low-stock, inspection `passed` logic, QR lookup).
- **Audit over deletion.** Work orders use soft-delete (`deletedAt`); parts quantity moves via `WorkOrderPart` rows so stock is always reconstructable from history. Hard deletes are reserved for genuinely throwaway reference data (locations/categories) and even there are guarded.
- **QR carries an opaque token, not the entity id.** Prevents enumeration of assets by guessing/scanning random UUIDs.
- **UI language.** Code, comments, and identifiers are English. Product UI ships English first; Russian/Kazakh localization is a fast-follow via `next-intl` — a meaningful plus for the KZ market, but not a Phase 0–11 blocker.
- **Reports persist in object storage (R2), never on the app disk.** Render/Vercel filesystems are ephemeral; storing CSVs there guarantees data loss on redeploy.

---

*Plan created for AI-agent implementation. Start with Phase 0.*
