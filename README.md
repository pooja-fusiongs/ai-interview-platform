## AI Interview Platform (Demo)

AI Interview Platform is a **demo, end‑to‑end AI‑assisted interview system** that helps organizations screen and evaluate candidates more efficiently.  
This repository contains both the **frontend** and **backend** needed to run the platform locally.

---

## Project Overview

**AI Interview Platform (Demo)** streamlines the hiring process by combining job management, candidate profiles, AI‑generated interview questions, and automated scoring in a single workflow.

- **Manual interviews are slow and hard to scale.** Recruiters and hiring managers spend a lot of time on repetitive screening calls.
- **This platform uses AI to conduct and analyze interviews**, helping recruiters focus on final decisions instead of early‑stage filtering.

> **Note**: This is a **demo project**, intended for evaluation, prototyping, and extension. It is not hardened for production as‑is.

---

## Problem Statement & Solution

- **Problem**: Companies do not have enough time or bandwidth for fully manual interviews and first‑round screenings.
- **Solution**: The AI Interview Platform automates large parts of the interview lifecycle:
  - AI conducts structured interviews with candidates.
  - Recruiters and experts review AI‑generated insights.
  - Automated scoring helps drive faster and more objective hiring decisions.

---

## Key Features

- **Job creation by recruiter**  
  Recruiters can create and manage job postings, including role details, skills, and experience requirements.

- **Candidate resume upload**  
  Candidates (or recruiters on their behalf) can upload resumes, which are stored and processed by the backend.

- **AI‑based question & answer generation**  
  The system can generate interview questions tailored to the job role and candidate profile, and support AI‑assisted answer evaluation.

- **Expert review and approval**  
  Domain experts can review AI‑generated questions and scoring, approve or adjust them, and provide final evaluations.

- **Video interview with AI analysis**  
  Supports an AI‑driven interview experience where candidate responses (e.g., spoken or typed) are analyzed for relevance and quality.

- **Automated scoring and decision making**  
  Candidate performance is scored automatically to assist with shortlisting and hiring decisions.

---

## Tech Stack

- **Frontend**  
  - React 18 + TypeScript  
  - Vite for development/build tooling  
  - React Router, Axios, and modern UI libraries (e.g., MUI, icon libraries)

- **Backend**  
  - FastAPI (Python) for REST APIs  
  - SQLAlchemy ORM for data access  
  - JWT‑based authentication & role management  
  - Uvicorn ASGI server

- **Database**  
  - SQLite for local development  
  - PostgreSQL support for more robust environments

- **AI / NLP**  
  - AI‑powered question generation and candidate scoring via backend services (extensible to any LLM / NLP provider through the `services` layer).

---

## Project Folder Structure

At the root of the repository:

- **`Frontend/`** – React + TypeScript single‑page application (Vite)  
  - `src/` – Application code (components, contexts, services, utils, etc.)  
  - `public/` – Static assets  
  - `package.json` – Frontend dependencies and scripts

- **`backend/`** – FastAPI backend  
  - `main_final.py` – Main application entry point  
  - `api/` – API modules (auth, candidates, interview, jobs, etc.)  
  - `models.py`, `schemas.py`, `crud.py` – Data models, Pydantic schemas, and DB operations  
  - `services/` – Business logic and AI‑related services  
  - `uploads/` – Uploaded files (e.g., resumes)  
  - `requirements.txt` – Backend Python dependencies

- **`Test/`** – Helper scripts and markdown instructions used for testing and verification.

> If you introduce any **shared / common** utilities in the future (e.g., shared type definitions or OpenAPI contracts), they can be placed in a dedicated `shared/` directory at the root.

---

## Environment Setup (Very Important)

This project uses environment variables for sensitive configuration (database URLs, JWT secrets, API URLs, etc.).

- **`.env` files are intentionally *not* committed** to source control for security reasons.
- For convenience, **sample environment files (`.env.example`) are provided** so you can create your own `.env` files.

### 1. Backend Environment

1. **Copy the example file**:
   - From the backend root:
     ```bash
     cd backend
     cp .env.example .env
     ```
2. **Open `.env` and configure values**:
   - Database connection (`DATABASE_URL`)
   - JWT settings (`SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`)
   - File upload paths and limits (e.g., `UPLOAD_DIR`, `MAX_FILE_SIZE`)
3. **Do not commit `.env`**:
   - Ensure `.env` remains in `.gitignore`.

### 2. Frontend Environment

1. **Copy the example file**:
   - From the frontend root:
     ```bash
     cd Frontend
     cp .env.example .env
     ```
2. **Set the API base URL** (see *API Configuration* below), e.g.:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   ```
3. **Restart the frontend dev server** after any change to `.env`.

---

## How to Run the Project Locally

### 1. Backend Setup

From the repository root:

1. **Navigate to backend**:
   ```bash
   cd backend
   ```
2. **(Optional but recommended) Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   # source venv/bin/activate
   ```
3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Create the backend `.env` from `.env.example`** (see section above), then ensure `DATABASE_URL` and JWT settings are valid.
5. **Start the backend server**:
   ```bash
   python main_final.py
   ```
6. The backend should now be running at:
   - **`http://localhost:8000`**
   - API docs available at `http://localhost:8000/docs`.

> The backend is designed to run **independently** of the frontend and can be tested directly via Swagger UI, Postman, or CLI scripts.

### 2. Frontend Setup

From the repository root:

1. **Navigate to frontend**:
   ```bash
   cd Frontend
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Create the frontend `.env` from `.env.example`** and **set the API base URL**, for example:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   ```
4. **Start the frontend dev server**:
   ```bash
   npm run dev
   ```
5. Open the application in your browser:
   - Typically at **`http://localhost:5173`** (Vite default; check your console output).

---

## API Configuration

- **API Base URL**  
  - Default local backend: `http://localhost:8000`
  - The frontend reads this value from the environment, e.g.:
    - `VITE_API_BASE_URL` (for Vite + React)

- **Backend runs independently**  
  - You can call backend APIs directly (without the frontend) for testing.
  - Health check: `GET /api/health`  
  - Auth, job, candidate, resume, and interview endpoints are exposed under the `/api/...` namespace.

When deploying or changing environments (staging, production), update the frontend `.env` with the correct `VITE_API_BASE_URL` pointing to the deployed backend.

---

## Project Status

- **Candidate module implemented**  
  - Candidate data model, APIs, resume upload, and matching logic are available in the backend.

- **Candidate profile UI in progress**  
  - Candidate profile pages and editing workflows are partially implemented in the frontend and may change.

---

## Note

- **This is a demo project** intended to showcase an AI‑driven interview workflow.  
- **Client‑specific configuration, branding, and integrations** (e.g., custom ATS, SSO, vendor‑specific AI providers) can be added on top of this base as needed.

For questions or onboarding new contributors, this `README.md` should be the starting point for understanding how to **clone, configure, and run** the AI Interview Platform (Demo).

