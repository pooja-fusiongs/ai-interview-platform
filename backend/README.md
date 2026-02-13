# 🚀 AI Interview Platform - Backend

A comprehensive FastAPI-based backend system for AI-powered interview management with advanced features including candidate matching, video interviews, GDPR compliance, and ATS integration.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Services](#services)
- [Security](#security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The AI Interview Platform Backend is a production-ready FastAPI application that powers an intelligent interview management system. It provides comprehensive APIs for authentication, job management, candidate evaluation, AI-powered question generation, video interviews, and GDPR-compliant data management.

### Key Capabilities

- **🔐 Secure Authentication**: JWT-based authentication with role-based access control (RBAC)
- **🤖 AI-Powered**: Gemini AI integration for question generation and answer scoring
- **📹 Video Interviews**: Zoom integration for virtual interviews with recording capabilities
- **🎯 Smart Matching**: AI-driven candidate-job matching with scoring algorithms
- **📊 ATS Integration**: Applicant Tracking System features for recruitment workflows
- **🔒 GDPR Compliant**: Data privacy, encryption, retention policies, and export capabilities
- **📈 Analytics**: Quality metrics, fraud detection, and performance tracking

---

## ✨ Features

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control (Admin, Recruiter, Domain Expert, Candidate)
- Secure password hashing with bcrypt
- Token refresh and expiration management

### Job Management
- Create, update, and delete job postings
- Job search and filtering
- Skills-based job matching
- Application tracking and status management
- Job statistics and analytics

### Candidate Management
- Resume upload and parsing (PDF, DOCX)
- Skill extraction from resumes
- Candidate profile management
- Application history tracking
- Candidate-job matching scores

### AI Question Generation
- Gemini AI-powered question generation
- Skill-based question customization
- Gold standard answer creation
- Question approval workflow
- Multi-level difficulty questions

### Interview System
- Video interview scheduling
- Zoom meeting integration
- Real-time answer scoring
- Interview recording management
- Automated candidate evaluation

### GDPR & Data Privacy
- PII data encryption
- Data retention policies
- Right to be forgotten
- Data export (JSON, CSV)
- Audit logging
- Consent management

### ATS Features
- Application pipeline management
- Candidate status tracking
- Recruiter workflows
- Feedback collection
- Quality metrics

---

## 🛠️ Tech Stack

### Core Framework
- **FastAPI** 0.104.1 - Modern, high-performance web framework
- **Uvicorn** 0.24.0 - ASGI server with WebSocket support
- **Python** 3.8+ - Programming language

### Database & ORM
- **SQLAlchemy** 2.0.23 - SQL toolkit and ORM
- **SQLite** - Development database (default)
- **PostgreSQL** - Production database (recommended)

### Authentication & Security
- **python-jose** 3.3.0 - JWT token handling
- **passlib** 1.7.4 - Password hashing with bcrypt
- **cryptography** 41.0.0+ - Encryption for PII data
- **PyJWT** 2.8.0+ - JSON Web Token implementation

### AI & ML
- **google-generativeai** 0.8.0+ - Gemini AI integration
- **scikit-learn** 1.3.2 - Machine learning for candidate matching

### Document Processing
- **PyPDF2** 3.0.1 - PDF resume parsing
- **python-docx** 0.8.11 - DOCX resume parsing

### Utilities
- **python-multipart** 0.0.6 - File upload support
- **python-dotenv** 1.0.0 - Environment variable management
- **requests** 2.31.0 - HTTP client for external APIs

---

## 🚀 Quick Start

### Option 1: SQLite Setup (Recommended for Development)

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
python main_final.py
```

Server will start at: **http://localhost:8000**

### Option 2: Minimal Setup (If Dependencies Fail)

```bash
cd backend
pip install fastapi uvicorn sqlalchemy pydantic python-jose passlib
python main_final.py
```

### Option 3: PostgreSQL Setup (Production)

See [PostgreSQL Configuration](#postgresql-configuration) section below.

---

## 📦 Installation

### Prerequisites

- **Python** 3.8 or higher
- **pip** package manager
- **PostgreSQL** (optional, for production)
- **Virtual environment** (recommended)

### Step-by-Step Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-interview-platform/backend
   ```

2. **Create virtual environment**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your configuration
   # See Configuration section below
   ```

5. **Initialize database**
   ```bash
   # Database tables are created automatically on first run
   python main_final.py
   ```

6. **Verify installation**
   ```bash
   # Test health endpoint
   curl http://localhost:8000/api/health
   ```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
# SQLite (Development)
DATABASE_URL=sqlite:///./ai_interview.db

# PostgreSQL (Production)
# DATABASE_URL=postgresql://username:password@localhost:5432/ai_interview_db

# ============================================
# JWT AUTHENTICATION
# ============================================
SECRET_KEY=your-super-secret-key-change-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ============================================
# AI SERVICES
# ============================================
# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key-here

# OpenAI (Optional)
OPENAI_API_KEY=your-openai-api-key-here

# ============================================
# SCORING CONFIGURATION
# ============================================
SCORE_SELECT_THRESHOLD=7.5
SCORE_NEXT_ROUND_THRESHOLD=5.0

# Scoring weights (must sum to 1.0)
WEIGHT_RELEVANCE=0.30
WEIGHT_COMPLETENESS=0.25
WEIGHT_ACCURACY=0.30
WEIGHT_CLARITY=0.15

# ============================================
# GDPR & DATA PRIVACY
# ============================================
PII_ENCRYPTION_KEY=your-32-byte-encryption-key-here
DATA_RETENTION_DEFAULT_DAYS=365
DATA_EXPORT_EXPIRY_HOURS=48

# ============================================
# ZOOM INTEGRATION
# ============================================
ZOOM_ACCOUNT_ID=your-zoom-account-id
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret
ZOOM_SDK_KEY=your-zoom-sdk-key
ZOOM_SDK_SECRET=your-zoom-sdk-secret

# ============================================
# CORS CONFIGURATION
# ============================================
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:3001

# ============================================
# FILE UPLOAD
# ============================================
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

### PostgreSQL Configuration

1. **Install PostgreSQL**
   - Download from: https://www.postgresql.org/download/
   - Default port: 5432

2. **Create database**
   ```sql
   CREATE DATABASE ai_interview_db;
   CREATE USER ai_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE ai_interview_db TO ai_user;
   ```

3. **Update .env**
   ```env
   DATABASE_URL=postgresql://ai_user:secure_password@localhost:5432/ai_interview_db
   ```

4. **Restart server**
   ```bash
   python main_final.py
   ```

### Generating Secret Keys

```python
# Generate SECRET_KEY
import secrets
print(secrets.token_urlsafe(32))

# Generate PII_ENCRYPTION_KEY (32 bytes)
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

---

## 🏗️ Architecture

### Project Structure

```
backend/
├── main_final.py              # Application entry point
├── config.py                  # Centralized configuration
├── database.py                # Database connection and session
├── models.py                  # SQLAlchemy database models
├── schemas.py                 # Pydantic request/response schemas
├── crud.py                    # Database CRUD operations
├── requirements.txt           # Python dependencies
├── .env                       # Environment variables (not in git)
├── .env.example              # Example environment file
│
├── api/                       # API route modules
│   ├── auth/                 # Authentication endpoints
│   │   ├── app.py           # Auth router
│   │   ├── jwt_handler.py   # JWT token management
│   │   └── role_manager.py  # Role-based access control
│   ├── jobs/                 # Job management endpoints
│   ├── candidates/           # Candidate management endpoints
│   ├── interview/            # Interview endpoints
│   ├── video/                # Video interview endpoints
│   ├── feedback/             # Feedback endpoints
│   ├── gdpr/                 # GDPR compliance endpoints
│   ├── ats/                  # ATS integration endpoints
│   └── recruiter/            # Recruiter-specific endpoints
│
├── services/                  # Business logic services
│   ├── ai_question_generator.py    # AI question generation
│   ├── answer_scorer.py            # Answer evaluation
│   ├── gemini_service.py           # Gemini AI integration
│   ├── recommendation_engine.py    # Candidate matching
│   ├── zoom_service.py             # Zoom integration
│   ├── encryption_service.py       # PII encryption
│   ├── data_retention_service.py   # GDPR data retention
│   ├── audit_service.py            # Audit logging
│   ├── quality_metrics_service.py  # Quality tracking
│   ├── fraud_simulator.py          # Fraud detection
│   └── ats/                        # ATS-specific services
│
└── uploads/                   # File storage
    └── resumes/              # Resume uploads
```

### Architecture Layers

1. **API Layer** (`api/`)
   - RESTful endpoints
   - Request validation
   - Response formatting
   - Route organization

2. **Service Layer** (`services/`)
   - Business logic
   - AI integrations
   - External API calls
   - Data processing

3. **Data Layer** (`models.py`, `crud.py`)
   - Database models
   - CRUD operations
   - Data validation
   - Relationships

4. **Configuration Layer** (`config.py`)
   - Environment variables
   - Application settings
   - Constants

---

## 📚 API Documentation

### Interactive Documentation

Once the server is running, access interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/api/health

### API Endpoints Overview

#### 🔐 Authentication (`/api/auth`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/auth/signup` | POST | Register new user | No |
| `/api/auth/login` | POST | User login | No |
| `/api/auth/me` | GET | Get current user | Yes |
| `/api/auth/refresh` | POST | Refresh access token | Yes |

#### 💼 Jobs (`/api/jobs`, `/api/createJob`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/jobs` | GET | List all jobs | No |
| `/api/jobs/{id}` | GET | Get job details | No |
| `/api/createJob` | POST | Create new job | Yes (Recruiter+) |
| `/api/jobs/{id}` | PUT | Update job | Yes (Recruiter+) |
| `/api/jobs/{id}` | DELETE | Delete job | Yes (Recruiter+) |
| `/api/jobs/search` | GET | Search jobs | No |
| `/api/jobs/stats` | GET | Job statistics | Yes (Recruiter+) |

#### 📝 Job Applications (`/api/job`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/job/apply` | POST | Submit application | No |
| `/api/job/{id}/applications` | GET | Get applications | Yes (Recruiter+) |
| `/api/job/{id}/check-application` | GET | Check if applied | No |

#### 👥 Candidates (`/api/candidates`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/candidates` | GET | List candidates | Yes (Recruiter+) |
| `/api/candidates/{id}` | GET | Get candidate details | Yes (Recruiter+) |
| `/api/candidates/matching` | GET | Get candidate matches | Yes (Recruiter+) |
| `/api/candidates/{id}/status` | PUT | Update status | Yes (Recruiter+) |

#### 📄 Resume Processing (`/api/resume`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/resume/upload` | POST | Upload resume | No |
| `/api/resume/parse` | POST | Parse resume | Yes (Recruiter+) |
| `/api/resume/download/{filename}` | GET | Download resume | Yes (Recruiter+) |

#### 🤖 AI Questions (`/api/questions`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/questions/generate` | POST | Generate questions | Yes (Recruiter+) |
| `/api/questions/approve` | POST | Approve questions | Yes (Expert+) |
| `/api/questions/approved/{jobId}` | GET | Get approved questions | Yes |

#### 🎥 Video Interviews (`/api/video`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/video/create-meeting` | POST | Create Zoom meeting | Yes (Recruiter+) |
| `/api/video/meetings` | GET | List meetings | Yes (Recruiter+) |
| `/api/video/recordings` | GET | Get recordings | Yes (Recruiter+) |

#### 🔒 GDPR (`/api/gdpr`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/gdpr/export` | POST | Request data export | Yes |
| `/api/gdpr/delete` | POST | Request data deletion | Yes |
| `/api/gdpr/consent` | POST | Update consent | Yes |
| `/api/gdpr/retention` | GET | Get retention policy | Yes (Admin) |

#### 📊 ATS (`/api/ats`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/ats/pipeline` | GET | Get pipeline status | Yes (Recruiter+) |
| `/api/ats/move-stage` | POST | Move candidate stage | Yes (Recruiter+) |
| `/api/ats/analytics` | GET | Get ATS analytics | Yes (Recruiter+) |

---

## 🗄️ Database Schema

### Core Tables

#### Users
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    company VARCHAR(100),
    role VARCHAR(20) DEFAULT 'candidate',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Roles**: `candidate`, `recruiter`, `domain_expert`, `admin`

#### Jobs
```sql
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    company VARCHAR(100) NOT NULL,
    location VARCHAR(100) NOT NULL,
    salary_range VARCHAR(50),
    job_type VARCHAR(50) NOT NULL,
    work_mode VARCHAR(50) NOT NULL,
    experience_level VARCHAR(50) NOT NULL,
    department VARCHAR(100) NOT NULL,
    skills_required TEXT,
    status VARCHAR(20) DEFAULT 'Open',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Job Applications
```sql
CREATE TABLE job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    applicant_name VARCHAR(100) NOT NULL,
    applicant_email VARCHAR(100) NOT NULL,
    applicant_phone VARCHAR(20),
    resume_url VARCHAR(500),
    cover_letter TEXT,
    experience_years INTEGER,
    current_company VARCHAR(100),
    current_position VARCHAR(100),
    expected_salary VARCHAR(50),
    availability VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Applied',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Application Statuses**: `Applied`, `Under Review`, `Interview Scheduled`, `Selected`, `Rejected`, `Withdrawn`

#### Candidate Resumes
```sql
CREATE TABLE candidate_resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES job_applications(id),
    job_id INTEGER REFERENCES jobs(id),
    resume_path VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    skills TEXT,
    experience_years INTEGER,
    experience_level VARCHAR(50),
    parsed_text TEXT,
    parsing_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Interview Questions
```sql
CREATE TABLE interview_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES jobs(id),
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    difficulty_level VARCHAR(20),
    gold_standard_answer TEXT,
    skills_tested TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Interview Sessions
```sql
CREATE TABLE interview_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES job_applications(id),
    job_id INTEGER REFERENCES jobs(id),
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Scheduled',
    zoom_meeting_id VARCHAR(100),
    recording_url VARCHAR(500),
    overall_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Interview Answers
```sql
CREATE TABLE interview_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES interview_sessions(id),
    question_id INTEGER REFERENCES interview_questions(id),
    answer_text TEXT,
    relevance_score DECIMAL(5,2),
    completeness_score DECIMAL(5,2),
    accuracy_score DECIMAL(5,2),
    clarity_score DECIMAL(5,2),
    overall_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Relationships

```mermaid
erDiagram
    users ||--o{ jobs : creates
    jobs ||--o{ job_applications : receives
    jobs ||--o{ interview_questions : has
    job_applications ||--o{ candidate_resumes : has
    job_applications ||--o{ interview_sessions : participates
    interview_sessions ||--o{ interview_answers : contains
    interview_questions ||--o{ interview_answers : answered_in
    users ||--o{ interview_questions : approves
```

---

## 🔧 Services

### AI Question Generator (`ai_question_generator.py`)

Generates interview questions using Gemini AI based on job requirements and candidate profiles.

**Features**:
- Skill-based question generation
- Difficulty level customization
- Gold standard answer creation
- Multiple question types (technical, behavioral, situational)

**Usage**:
```python
from services.ai_question_generator import generate_questions

questions = generate_questions(
    job_id=1,
    skills=["Python", "FastAPI", "SQL"],
    difficulty="intermediate",
    count=10
)
```

### Answer Scorer (`answer_scorer.py`)

Evaluates candidate answers using multi-dimensional scoring.

**Scoring Dimensions**:
- **Relevance** (30%): How well the answer addresses the question
- **Completeness** (25%): Coverage of key points
- **Accuracy** (30%): Technical correctness
- **Clarity** (15%): Communication quality

**Usage**:
```python
from services.answer_scorer import score_answer

score = score_answer(
    question="Explain REST API principles",
    answer=candidate_answer,
    gold_standard=gold_answer
)
# Returns: {
#   "relevance": 8.5,
#   "completeness": 7.0,
#   "accuracy": 9.0,
#   "clarity": 8.0,
#   "overall": 8.2
# }
```

### Gemini Service (`gemini_service.py`)

Integrates Google Gemini AI for various tasks.

**Capabilities**:
- Question generation
- Answer evaluation
- Resume parsing
- Skill extraction
- Transcript analysis

### Recommendation Engine (`recommendation_engine.py`)

Matches candidates to jobs using ML algorithms.

**Matching Factors**:
- Skills overlap
- Experience level
- Location preferences
- Salary expectations
- Cultural fit indicators

### Zoom Service (`zoom_service.py`)

Manages Zoom integration for video interviews.

**Features**:
- Meeting creation
- Participant management
- Recording access
- Webhook handling

### Encryption Service (`encryption_service.py`)

Handles PII data encryption for GDPR compliance.

**Features**:
- Fernet symmetric encryption
- Field-level encryption
- Key rotation support

### Data Retention Service (`data_retention_service.py`)

Manages data lifecycle and GDPR compliance.

**Features**:
- Automated data deletion
- Retention policy enforcement
- Data export generation
- Anonymization

### Audit Service (`audit_service.py`)

Tracks all system activities for compliance.

**Logged Events**:
- User actions
- Data access
- Data modifications
- Export requests
- Deletion requests

---

## 🔒 Security

### Authentication Flow

1. **User Registration**
   - Password hashed with bcrypt
   - User stored in database
   - Email verification (optional)

2. **User Login**
   - Credentials validated
   - JWT token generated
   - Token includes user ID, role, expiration

3. **Authenticated Requests**
   - Token sent in Authorization header
   - Token validated and decoded
   - User permissions checked

### Role-Based Access Control

| Role | Level | Permissions |
|------|-------|-------------|
| **Candidate** | 1 | Apply for jobs, view own applications, take interviews |
| **Recruiter** | 2 | All Candidate + Create jobs, view applications, manage candidates |
| **Domain Expert** | 3 | All Recruiter + Create questions, approve questions, evaluate answers |
| **Admin** | 4 | All permissions + User management, system settings, analytics |

### Security Best Practices

- ✅ Passwords hashed with bcrypt (cost factor: 12)
- ✅ JWT tokens with expiration
- ✅ CORS configured for allowed origins
- ✅ PII data encrypted at rest
- ✅ SQL injection prevention (SQLAlchemy ORM)
- ✅ Input validation (Pydantic schemas)
- ✅ File upload restrictions (size, type)
- ✅ Rate limiting (recommended for production)
- ✅ HTTPS enforcement (recommended for production)

---

## 🚀 Deployment

### Production Checklist

- [ ] **Change SECRET_KEY** to a strong random value
- [ ] **Use PostgreSQL** instead of SQLite
- [ ] **Set strong database password**
- [ ] **Configure GEMINI_API_KEY** for AI features
- [ ] **Set up Zoom credentials** for video interviews
- [ ] **Generate PII_ENCRYPTION_KEY** for GDPR compliance
- [ ] **Configure CORS_ORIGINS** for your frontend domain
- [ ] **Enable HTTPS/SSL**
- [ ] **Set up database backups**
- [ ] **Configure logging** (file-based, centralized)
- [ ] **Set up monitoring** (health checks, alerts)
- [ ] **Configure rate limiting**
- [ ] **Set up CDN** for file uploads
- [ ] **Enable database connection pooling**

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main_final:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
# Build image
docker build -t ai-interview-backend .

# Run container
docker run -d -p 8000:8000 --env-file .env ai-interview-backend
```

### Production Environment Variables

```env
DATABASE_URL=postgresql://user:password@db-host:5432/ai_interview_db
SECRET_KEY=<generate-strong-key-min-64-chars>
GEMINI_API_KEY=<your-production-gemini-key>
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
DEBUG=false
LOG_LEVEL=INFO
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Problem**: `sqlalchemy.exc.OperationalError: unable to open database file`

**Solution**:
```bash
# Ensure database directory exists
mkdir -p backend

# Check DATABASE_URL in .env
DATABASE_URL=sqlite:///./ai_interview.db

# For PostgreSQL, verify connection
psql -h localhost -U postgres -d ai_interview_db
```

#### 2. Import Errors

**Problem**: `ModuleNotFoundError: No module named 'fastapi'`

**Solution**:
```bash
# Activate virtual environment
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

#### 3. Port Already in Use

**Problem**: `OSError: [Errno 98] Address already in use`

**Solution**:
```bash
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8000 | xargs kill -9

# Or use different port
uvicorn main_final:app --port 8001
```

#### 4. JWT Token Errors

**Problem**: `JWTError: Signature verification failed`

**Solution**:
```bash
# Ensure SECRET_KEY is consistent
# Check .env file has correct SECRET_KEY
# Clear browser cookies/localStorage
# Generate new token by logging in again
```

#### 5. File Upload Fails

**Problem**: `413 Request Entity Too Large`

**Solution**:
```env
# Increase MAX_FILE_SIZE in .env
MAX_FILE_SIZE=20971520  # 20MB

# Ensure upload directory exists
mkdir -p uploads/resumes
```

#### 6. CORS Errors

**Problem**: `Access to fetch blocked by CORS policy`

**Solution**:
```env
# Add frontend URL to CORS_ORIGINS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Restart backend server
```

#### 7. Gemini API Errors

**Problem**: `google.api_core.exceptions.PermissionDenied`

**Solution**:
```bash
# Verify GEMINI_API_KEY is valid
# Check API quota and billing
# Ensure Gemini API is enabled in Google Cloud Console
```

### Debug Mode

Enable detailed error messages:

```python
# In main_final.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_final:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
        log_level="debug"  # Detailed logs
    )
```

### Logging

```python
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
```

---

## 🧪 Testing

### Manual API Testing

#### Using cURL

```bash
# Health check
curl http://localhost:8000/api/health

# User signup
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"Test123!@#"}'

# User login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=Test123!@#"

# Get current user (with token)
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <your-token-here>"
```

#### Using Python

```python
import requests

BASE_URL = "http://localhost:8000"

# Signup
response = requests.post(f"{BASE_URL}/api/auth/signup", json={
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test123!@#"
})
print(response.json())

# Login
response = requests.post(f"{BASE_URL}/api/auth/login", data={
    "username": "testuser",
    "password": "Test123!@#"
})
token = response.json()["access_token"]

# Get user info
headers = {"Authorization": f"Bearer {token}"}
response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
print(response.json())
```

### Automated Testing

```bash
# Install pytest
pip install pytest pytest-asyncio httpx

# Run tests
pytest tests/ -v
```

---

## 📞 Support & Resources

### Documentation
- **API Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### External Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Google Gemini API](https://ai.google.dev/docs)
- [Zoom API Documentation](https://marketplace.zoom.us/docs/api-reference/introduction)

### Getting Help

1. Check the [Troubleshooting](#troubleshooting) section
2. Review server logs for error messages
3. Verify environment variables are set correctly
4. Test with minimal setup first
5. Check database connectivity
6. Ensure all dependencies are installed

---

## 📄 License

This project is a demo application intended for evaluation and prototyping purposes.

---

## 🎉 Success Indicators

You'll know everything is working when:

✅ **Server starts successfully**:
```
🚀 Starting AI Interview Platform API...
✅ Database tables created
✅ All endpoints registered
INFO: Uvicorn running on http://0.0.0.0:8000
```

✅ **Health check returns 200 OK**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

✅ **Swagger docs load** at http://localhost:8000/docs

✅ **User signup/login works** and returns JWT token

✅ **Database operations succeed** (create, read, update, delete)

✅ **Frontend can connect** without CORS errors

---

**Built with ❤️ using FastAPI and modern Python**