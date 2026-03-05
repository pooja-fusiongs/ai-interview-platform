# AI Interview Platform

> Enterprise-grade AI-powered recruitment platform with video interviews, fraud detection, GDPR compliance, and ATS integration

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## 🎯 Overview

AI Interview Platform is a comprehensive recruitment solution that combines artificial intelligence, video interviewing, and advanced analytics to streamline the hiring process. The platform supports multiple user roles (Recruiters, Domain Experts, Admins, and Candidates) with role-based access control and features like automated question generation, real-time fraud detection, and GDPR-compliant data management.

### Platform Capabilities

- **AI-Powered Question Generation**: Automatically generate interview questions based on job requirements and candidate profiles
- **Video Interview System**: Conduct live video interviews with recording, transcription, and analysis
- **Fraud Detection**: Real-time detection of suspicious behavior during video interviews
- **Automated Scoring**: AI-based evaluation of candidate responses with detailed feedback
- **ATS Integration**: Seamless integration with Greenhouse, Lever, and BambooHR
- **GDPR Compliance**: Complete data privacy controls including consent management, data export, and deletion
- **Post-Hire Feedback**: Track candidate performance after hiring to refine scoring algorithms

---

## ✨ Key Features

### 🤖 AI & Machine Learning
- **Gemini AI Integration**: Advanced question generation and transcript scoring
- **Groq API**: Fast, quota-free alternative for transcript analysis
- **Resume Parsing**: Automatic extraction of skills, experience, and qualifications
- **Candidate Matching**: AI-powered job-candidate matching algorithm

### 🎥 Video Interview System
- **Daily.co Integration**: High-quality video conferencing
- **LiveKit Support**: Real-time communication infrastructure (newly added)
- **Recording & Transcription**: Automatic interview recording and transcript generation
- **Fraud Detection**: 
  - Voice consistency analysis
  - Lip-sync detection
  - Body movement tracking
  - Real-time flag monitoring

### 👥 User Management
- **Multi-Role System**: Recruiter, Domain Expert, Admin, Candidate
- **Profile Management**: Comprehensive user profiles with skills, experience, education
- **Activity Tracking**: Real-time online status and activity monitoring
- **Authentication**: JWT-based secure authentication with role-based access control

### 📊 Recruitment Workflow
- **Job Management**: Create, update, and manage job postings
- **Application Tracking**: Monitor candidate applications and status
- **Question Generation**: AI-generated interview questions with expert review
- **Interview Sessions**: Conduct and manage interview sessions
- **Scoring & Evaluation**: Automated scoring with detailed feedback
- **Post-Hire Feedback**: Track hired candidate performance

### 🔒 GDPR & Privacy
- **Consent Management**: Track and manage user consents
- **Data Export**: Allow users to export their personal data
- **Right to Erasure**: Process deletion requests
- **Data Retention Policies**: Automated data retention and cleanup
- **Audit Logging**: Complete audit trail of data access and modifications
- **PII Encryption**: Encrypt sensitive personal information

### 🔗 Integrations
- **ATS Systems**: Greenhouse, Lever, BambooHR
- **Video Platforms**: Daily.co, Zoom, LiveKit
- **Email**: SendGrid for notifications
- **Cloud Storage**: Resume and recording storage

---

## 🛠 Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.9+)
- **Database**: PostgreSQL (production) / SQLite (development)
- **ORM**: SQLAlchemy
- **Authentication**: JWT (python-jose)
- **AI/ML**: 
  - Google Gemini AI
  - Groq API
  - scikit-learn
- **Video**: 
  - Daily.co API
  - LiveKit
  - Zoom SDK
- **Document Processing**: PyPDF2, python-docx
- **Encryption**: cryptography library

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **Routing**: React Router v6
- **State Management**: React Context API
- **HTTP Client**: Axios
- **Charts**: Recharts
- **Icons**: Lucide React, Font Awesome
- **Video**: 
  - LiveKit Components React
  - LiveKit Client
- **Notifications**: react-hot-toast

### DevOps & Infrastructure
- **Hosting**: Render (backend), Vercel/Netlify (frontend)
- **Database**: Render PostgreSQL
- **Environment**: dotenv for configuration
- **CORS**: Configured for multiple origins

---

## 🏗 Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │Jobs      │  │Candidates│  │Interviews│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Auth      │  │Jobs      │  │Candidates│  │Interviews│   │
│  │Router    │  │Router    │  │Router    │  │Router    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │GDPR      │  │ATS       │  │Video     │  │Fraud     │   │
│  │Router    │  │Router    │  │Router    │  │Detection │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Gemini AI │  │Groq API  │  │Daily.co  │  │LiveKit   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │SendGrid  │  │ATS APIs  │  │PostgreSQL│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Overview

**Core Tables**:
- `users` - User accounts with roles and profiles
- `jobs` - Job postings
- `job_applications` - Candidate applications
- `candidate_resumes` - Parsed resume data

**Interview Tables**:
- `interview_questions` - Generated questions
- `interview_sessions` - Interview sessions
- `interview_answers` - Candidate answers
- `question_generation_sessions` - Question generation tracking

**Video Interview Tables**:
- `video_interviews` - Video interview sessions
- `fraud_analyses` - Fraud detection results

**GDPR Tables**:
- `consent_records` - User consent tracking
- `deletion_requests` - Data deletion requests
- `data_export_requests` - Data export requests
- `audit_logs` - Audit trail
- `data_retention_policies` - Retention policies

**ATS Tables**:
- `ats_connections` - ATS integrations
- `ats_sync_logs` - Sync history
- `ats_job_mappings` - Job mappings
- `ats_candidate_mappings` - Candidate mappings

**Feedback Tables**:
- `post_hire_feedback` - Post-hire performance feedback
- `quality_metrics` - Quality metrics and analytics

---

## 🚀 Installation

### Prerequisites

- Python 3.9+
- Node.js 16+
- PostgreSQL 13+ (for production)
- Git

### Backend Setup

```bash
# Clone repository
git clone <repository-url>
cd ai-interview-platform

# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (see Configuration section)
cp .env.example .env

# Run database migrations
python -c "from database import Base, engine; Base.metadata.create_all(bind=engine)"

# Start backend server
uvicorn main_final:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
# Navigate to frontend
cd Frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env.local

# Start development server
npm run dev
```

---

## ⚙️ Configuration

### Backend Environment Variables (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Authentication
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI Services
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key  # Optional

# Video Services
DAILY_API_KEY=your-daily-api-key
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_URL=wss://your-livekit-url

# Zoom (Optional)
ZOOM_ACCOUNT_ID=your-zoom-account-id
ZOOM_CLIENT_ID=your-zoom-client-id
ZOOM_CLIENT_SECRET=your-zoom-client-secret

# Email
SENDGRID_API_KEY=your-sendgrid-api-key
SENDER_EMAIL=your-sender-email

# Encryption
PII_ENCRYPTION_KEY=your-encryption-key

# GDPR
DATA_RETENTION_DEFAULT_DAYS=365
DATA_EXPORT_EXPIRY_HOURS=48
```

### Frontend Environment Variables (.env.local)

```env
# API Configuration
VITE_API_URL=http://localhost:8000
VITE_API_BASE_URL=http://localhost:8000/api

# LiveKit
VITE_LIVEKIT_URL=wss://your-livekit-url
```

---

## 📚 API Documentation

### Authentication Endpoints

```
POST   /api/auth/signup          - Register new user
POST   /api/auth/login           - User login
GET    /api/auth/me              - Get current user
GET    /api/auth/profile         - Get user profile
PUT    /api/auth/profile         - Update user profile
POST   /api/auth/change-password - Change password
POST   /api/auth/activity        - Update activity status
POST   /api/auth/logout          - User logout
```

### Job Endpoints

```
GET    /api/jobs                 - List all jobs
POST   /api/createJob            - Create new job
GET    /api/jobs/{id}            - Get job details
PUT    /api/jobs/{id}            - Update job
GET    /api/jobs/search          - Search jobs
GET    /api/jobs/stats           - Get job statistics
POST   /api/job/apply            - Apply for job
POST   /api/job/apply-with-resume - Apply with resume upload
```

### Candidate Endpoints

```
GET    /api/candidates           - List all candidates
GET    /api/candidates/{id}/interviews - Get candidate interviews
POST   /api/candidates/{id}/generate-questions - Generate questions
POST   /api/candidates/{id}/upload-transcript - Upload transcript
POST   /api/candidates/{id}/generate-score - Generate score
POST   /api/candidates/{id}/activity - Update activity
GET    /api/candidates/online-status - Get online status
```

### Interview Endpoints

```
POST   /api/interview/generate-questions - Generate questions
GET    /api/interview/questions/{sessionId} - Get questions
POST   /api/interview/submit-answer - Submit answer
POST   /api/interview/complete - Complete interview
GET    /api/interview/results/{sessionId} - Get results
```

### Video Interview Endpoints

```
POST   /api/video/schedule       - Schedule video interview
GET    /api/video/interviews     - List video interviews
GET    /api/video/interviews/{id} - Get interview details
POST   /api/video/join           - Join video room
POST   /api/video/upload-transcript - Upload transcript
POST   /api/video/end            - End interview
DELETE /api/video/interviews/{id} - Delete interview
```

### GDPR Endpoints

```
GET    /api/gdpr/consent         - Get consent records
POST   /api/gdpr/consent         - Grant consent
PUT    /api/gdpr/consent/{id}    - Revoke consent
POST   /api/gdpr/export          - Request data export
GET    /api/gdpr/export/{id}     - Download export
POST   /api/gdpr/deletion        - Request deletion
GET    /api/gdpr/audit           - Get audit logs
GET    /api/gdpr/retention       - Get retention policies
```

### ATS Endpoints

```
POST   /api/ats/connect          - Connect ATS
GET    /api/ats/connections      - List connections
POST   /api/ats/sync             - Trigger sync
GET    /api/ats/sync/logs        - Get sync logs
GET    /api/ats/mappings         - Get job mappings
```

### Fraud Detection Endpoints

```
GET    /api/fraud/dashboard      - Fraud dashboard
GET    /api/fraud/analysis/{id}  - Get fraud analysis
POST   /api/fraud/analyze        - Analyze interview
GET    /api/fraud/flags          - Get flagged interviews
```

---

## 🗄 Database Schema

### User Roles
- `RECRUITER` - Can create jobs, manage candidates
- `DOMAIN_EXPERT` - Can review questions, conduct interviews
- `ADMIN` - Full system access
- `CANDIDATE` - Can apply for jobs, take interviews

### Key Relationships

```
User (1) ──── (N) Job
User (1) ──── (N) JobApplication
Job (1) ──── (N) JobApplication
JobApplication (1) ──── (1) CandidateResume
JobApplication (1) ──── (N) InterviewQuestion
JobApplication (1) ──── (N) InterviewSession
InterviewSession (1) ──── (N) InterviewAnswer
InterviewSession (1) ──── (1) VideoInterview
VideoInterview (1) ──── (1) FraudAnalysis
```

---

## 🌐 Deployment

### Backend Deployment (Render)

1. Create new Web Service on Render
2. Connect GitHub repository
3. Configure build command: `pip install -r requirements.txt`
4. Configure start command: `uvicorn main_final:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from .env
6. Deploy

### Frontend Deployment (Vercel)

1. Connect GitHub repository to Vercel
2. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variables
4. Deploy

### Database Setup (Render PostgreSQL)

1. Create PostgreSQL database on Render
2. Copy connection string
3. Update `DATABASE_URL` in backend environment variables
4. Database tables will be created automatically on first run

---

## 📝 Usage Examples

### Creating a Job

```typescript
const jobData = {
  title: "Senior Software Engineer",
  description: "We are looking for...",
  company: "Tech Corp",
  location: "Remote",
  job_type: "Full-time",
  experience_level: "Senior",
  skills_required: ["Python", "React", "PostgreSQL"],
  number_of_openings: 2
};

const response = await axios.post('/api/createJob', jobData);
```

### Generating Interview Questions

```typescript
const response = await axios.post(
  `/api/candidates/${candidateId}/generate-questions`,
  {
    job_id: jobId,
    total_questions: 10,
    generation_mode: "balanced"
  }
);
```

### Scheduling Video Interview

```typescript
const response = await axios.post('/api/video/schedule', {
  job_id: jobId,
  candidate_id: candidateId,
  scheduled_at: "2024-03-15T10:00:00Z",
  duration_minutes: 60
});
```

---

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for password security
- **PII Encryption**: Sensitive data encrypted at rest
- **CORS Protection**: Configured allowed origins
- **SQL Injection Prevention**: SQLAlchemy ORM
- **XSS Protection**: Input sanitization
- **GDPR Compliance**: Complete data privacy controls

---

## 🧪 Testing

### Backend Tests

```bash
cd backend
pytest tests/
```

### Frontend Tests

```bash
cd Frontend
npm run test
```

---

## 📊 Monitoring & Analytics

- **User Activity Tracking**: Real-time online status
- **Interview Analytics**: Completion rates, scores
- **Quality Metrics**: Post-hire performance tracking
- **Fraud Detection**: Suspicious behavior monitoring
- **Audit Logs**: Complete activity trail

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 👥 Team

- **Development Team**: FusionGS
- **Contact**: pooja@fusiongs.com

---

## 🆘 Support

For support, email pooja@fusiongs.com or create an issue in the repository.

---

## 🗺 Roadmap

- [ ] LiveKit AI Interview Integration
- [ ] Advanced Analytics Dashboard
- [ ] Mobile App (React Native)
- [ ] Multi-language Support
- [ ] Advanced Fraud Detection (AI-powered)
- [ ] Integration with more ATS systems
- [ ] Candidate Portal Enhancements
- [ ] Real-time Collaboration Features

---

**Built with ❤️ by FusionGS**
