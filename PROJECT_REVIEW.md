# Mouth-Talk: Project Architecture & Review

A comprehensive overview of the **Mouth-Talk** movie platform's technical architecture, data flows, and security implementations.

## 🌟 1. Project Overview
Mouth-Talk is a movie-centric web application designed for reviews, bookings, and movie information. It follows a hybrid data management strategy, combining local performance with cloud-based persistence.

---

## 🎨 2. Frontend Architecture
The frontend is built using a **vanilla-first** philosophy, prioritizing performance and simplicity.

- **Core Technologies**: HTML5, Vanilla CSS, and Modern JavaScript (ES6+).
- **Structure**:
    - **`frontend/index.html`**: The main entry point of the application.
    - **`frontend/pages/`**: Contains specialized views for movies, onboarding, and about sections.
    - **`frontend/assets/js/`**: Modular logic for authentication, UI interactions, and API communications.
- **Client-Side Security**:
    - **`auth-guard.js`**: A specialized middleware-like script that protects routes by checking the backend `/api/auth/me` endpoint before allowing access to sensitive pages.

---

## ⚙️ 3. Backend Architecture
The backend is a robust **Node.js + Express** server that coordinates data between the frontend, a MongoDB database, and local JSON files.

- **Server Entry Point**: `backend/server.js` (aliased to the root `server.js`).
- **Database Strategy (Hybrid Sync)**:
    - **Primary**: MongoDB Atlas (Cloud Database).
    - **Fallback/Local**: Data is also stored in `backend/data/*.json` files.
    - **Synchronization**: On startup, the server can sync data from local JSON to MongoDB OR download the latest data from MongoDB into local JSON files to ensure consistency across environments.
- **Git Integration**: When an admin adds a new movie or uploads an image, the backend executes a `git push` automation. This ensures that the data in the repository is always synchronized with the latest administrative changes.

---

## 🔒 4. Authentication Flow
Mouth-Talk uses a multi-layered authentication system combining **Firebase Auth** for convenience and **Custom JWT** for session security.

1.  **Provider Verification**: The user logs in via Google or Phone (Firebase).
2.  **Token Exchange**: The frontend sends the Firebase `idToken` to `POST /api/auth/google` (or `/phone`).
3.  **Backend Validation**: The server verifies the token using `firebase-admin`.
4.  **Session Creation**: If valid, the server generates a custom **JWT** (JSON Web Token) containing user metadata.
5.  **Secure Storage**: The JWT is sent back to the browser in an **HTTP-only, Secure Cookie (`token`)**. This prevents XSS attacks from stealing the session.
6.  **Admin Access**: Routes like movie creation are restricted to specific authorized emails (e.g., `ramaiah5496@gmail.com`) checked via custom middleware.

---

## 🌐 5. CORS (Cross-Origin Resource Sharing)
To ensure secure communication between the frontend and backend, CORS is configured with a dynamic whitelist.

- **Strategy**: The backend whitelist includes `http://localhost:3000` and `http://localhost:5173`.
- **Credentials**: `credentials: true` is enabled to allow the secure HTTP-only cookies to be sent with every request.
- **Logging**: The system logs any blocked origin attempts to the console for easier debugging of deployment issues.

---

## 🔄 6. Data & System Flow
The overall flow of the application can be summarized as:

1.  **User Access**: User loads the static frontend.
2.  **Auth Check**: `auth-guard.js` verifies the session cookie with the backend.
3.  **Data Fetching**: The frontend requests movie or review data from `/api/movies`.
4.  **Admin Operations**:
    - Admin adds a movie → Backend updates MongoDB → Backend updates `movies.json` → **Backend triggers `git push`**.
    - This circular flow ensures the repository stays "alive" and up-to-date with the database.
5.  **Reviews**: Users can submit reviews using 10-character alphanumeric booking IDs, which are verified against the database to prevent spam.

---

## 🛠️ 7. Key Dependencies
- **`express`**: Web framework.
- **`mongodb`**: Database driver.
- **`firebase-admin`**: Authentication verification.
- **`jsonwebtoken`**: Session management.
- **`cookie-parser`**: Secure cookie handling.
- **`cors`**: Security header management.
