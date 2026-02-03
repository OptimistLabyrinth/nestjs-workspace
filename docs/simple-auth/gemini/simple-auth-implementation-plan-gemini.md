# Simple Authentication Implementation Plan

## Goal
Implement Korean Simple Authentication (e.g., Kakao, Naver) into the existing platform using NestJS (Backend) and React (Frontend).

## Architecture Overview
- **Pattern:** OAuth 2.0 Authorization Code Grant
- **Backend:** NestJS with VSA (Vertical Sliced Architecture)
- **Frontend:** React with FSD (Feature Sliced Design)

## User Review Required
> [!IMPORTANT]
> **Database Schema Changes:** Requires adding `ci` (Connecting Information) and `di` (Duplication Information) columns to the `User` entity to uniquely identify users across different simple auth providers.
> **Environment Variables:** Need to secure `CLIENT_ID` and `CLIENT_SECRET` for each provider (Kakao, Naver, etc.) in the `.env` file.

## Proposed Changes

### Backend (NestJS / VSA)

#### [NEW] `src/modules/auth/simple-auth` (Slice)
Create a new vertical slice for Simple Auth to keep it isolated.

-   `simple-auth.controller.ts`:
    -   `GET /auth/simple/:provider`: Redirects user to the provider's auth page.
    -   `GET /auth/simple/:provider/callback`: Handles the redirect from provider, exchanges code for token, fetches user info.
-   `simple-auth.service.ts`:
    -   `getLoginUrl(provider)`
    -   `handleCallback(provider, code)`
    -   `linkUser(userInfo)`: Logic to find or create a user based on `CI`.
-   `simple-auth.dto.ts`: Validation for query parameters (code, state).

#### [MODIFY] `src/modules/user/user.entity.ts`
-   Add columns:
    -   `ci` (varchar, 88, unique, nullable)
    -   `di` (varchar, 64, nullable) - *Note: DI is per provider/service, might need a separate table if tracking multiple DIs, but usually 1-to-1 for the main service.*
    -   `provider` (varchar, nullable) - e.g., 'kakao', 'naver'.

### Frontend (React / FSD)

#### [NEW] `src/features/auth/simple-login` (Feature)
-   `ui/SimpleLoginButtons.tsx`: Component displaying login buttons (Kakao, Naver).
    -   Each button links to `API_URL/auth/simple/:provider`.

#### [NEW] `src/pages/auth/callback` (Page)
-   Route: `/auth/callback` (Optional, if backend redirects here with a temporary token).
-   Logic: Captures the token from URL or cookie, initializes the user session in Redux Store.

#### [MODIFY] `src/shared/api/auth.ts`
-   Add endpoints for initiating simple auth (if using an AJAX approach, though full redirect is common).

## Detailed Flow
1.  **User** clicks "Kakao Login" on Frontend.
2.  **Frontend** redirects browser to Backend: `GET /auth/simple/kakao`.
3.  **Backend** generates state, constructs Kakao URL, and responds with `302 Redirect`.
4.  **User** authenticates on Kakao.
5.  **Kakao** redirects back to Backend: `GET /auth/simple/kakao/callback?code=...`.
6.  **Backend** exchanges `code` for `access_token` (Server-to-Server).
7.  **Backend** requests User Info (CI/DI) from Kakao.
8.  **Backend** finds/creates User in DB.
9.  **Backend** issues Service Access Token (JWT).
10. **Backend** redirects to Frontend (e.g., `CLIENT_URL/auth/callback?token=...`).
11. **Frontend** stores token and updates Redux state.

## Verification Plan

### Automated Tests
-   **Unit Tests (`simple-auth.service.spec.ts`):**
    -   Mock `HttpService` to simulate Provider responses.
    -   Verify `getLoginUrl` returns correct parameters.
    -   Verify `linkUser` correctly matches existing user by CI.

### Manual Verification
1.  **Setup:** Configure `.env` with valid Kakao Dev API keys.
2.  **Execution:**
    -   Click "Kakao Login" button.
    -   Verify redirection to Kakao.
    -   Login with Kakao.
    -   Verify redirection back to app and successful login state (JWT present).
    -   Check DB to ensure `ci` is saved.
