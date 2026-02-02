# 🚀 AI Interview Platform Backend

FastAPI backend with SQLite/PostgreSQL database for authentication, job management, and resume processing.

## 🎯 Features

- **🔐 Authentication**: JWT-based authentication with role-based access control
- **👥 User Roles**: Recruiter, Domain Expert, Admin, Candidate
- **💼 Job Management**: Create, view, apply for jobs with application tracking
- **📄 Resume Processing**: Upload, parse, and extract skills from resumes
- **🎯 Candidate Matching**: AI-powered candidate matching with scoring
- **📊 Database**: SQLite (development) / PostgreSQL (production)
- **🔒 Security**: Password hashing, JWT tokens, CORS enabled

## 🚀 Quick Start (Recommended)

### Option 1: SQLite Setup (Easiest)
```bash
cd backend
pip install -r requirements.txt
python main_final.py
```

### Option 2: Ultra Simple Setup (No Dependencies Issues)
```bash
cd backend
pip install fastapi uvicorn sqlalchemy pydantic
python main_final.py
```

That's it! 🎉 Server runs on: `http://localhost:8000`

## 🐘 PostgreSQL Setup (Production)

### Step 1: Install PostgreSQL
Download from: https://www.postgresql.org/download/
- **Default Port**: 5432
- **Default User**: postgres
- **Set Password**: admin123 (or your choice)

### Step 2: Configure Environment
Update `.env` file:
```env
DATABASE_URL=postgresql://postgres:admin123@localhost:5432/ai_interview_db
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Step 3: Start Server
```bash
cd backend
pip install -r requirements.txt
python main_final.py
```

### Step 4: DBeaver Connection (Optional)
- **Host**: localhost
- **Port**: 5432
- **Database**: ai_interview_db
- **Username**: postgres
- **Password**: admin123

## 🧪 Test Your Setup

### Quick API Test
```bash
python -c "
import requests
response = requests.get('http://localhost:8000/api/health')
print('Status:', response.status_code)
print('Response:', response.json())
"
```

### Test User Creation
```bash
python -c "
import requests
data = {'username': 'testuser', 'email': 'test@example.com', 'password': 'password123'}
response = requests.post('http://localhost:8000/api/auth/signup', json=data)
print('Signup Status:', response.status_code)
print('Response:', response.json())
"
```

## 🌐 API Endpoints

### 🔐 Authentication
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/signup` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/auth/me` | GET | Get current user info |

### 💼 Job Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/jobs` | GET | Get all jobs |
| `/api/jobs/{id}` | GET | Get specific job |
| `/api/createJob` | POST | Create new job |
| `/api/jobs/search?q={query}` | GET | Search jobs |
| `/api/jobs/stats` | GET | Get job statistics |

### 📝 Job Applications
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/job/apply` | POST | Submit job application |
| `/api/job/{id}/check-application?email={email}` | GET | Check if already applied |
| `/api/job/{id}/applications` | GET | Get job applications |

### 🎯 Candidate Matching
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/candidates/matching` | GET | Get candidate matches |
| `/api/candidates/{id}/status` | PUT | Update candidate status |

### 📄 Resume Processing
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/resume/upload` | POST | Upload resume |
| `/api/resume/parse` | POST | Parse resume |
| `/api/resume/download/{filename}` | GET | Download resume |

## 👥 User Roles & Permissions

### **Candidate** (Level 1)
- ✅ Apply for jobs
- ✅ View own applications
- ✅ Upload resume
- ✅ Take interviews

### **Recruiter** (Level 2)
- ✅ All Candidate permissions +
- ✅ Create jobs
- ✅ View job applications
- ✅ Review candidates
- ✅ Update candidate status

### **Domain Expert** (Level 3)
- ✅ All Recruiter permissions +
- ✅ Create interview questions
- ✅ Review interviews
- ✅ Evaluate candidates

### **Admin** (Level 4)
- ✅ All permissions +
- ✅ Manage users
- ✅ System settings
- ✅ View analytics

## 📊 Database Schema

### Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR UNIQUE NOT NULL,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    company VARCHAR,
    role VARCHAR DEFAULT 'candidate',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Jobs Table
```sql
CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    title VARCHAR NOT NULL,
    description TEXT NOT NULL,
    company VARCHAR NOT NULL,
    location VARCHAR NOT NULL,
    salary_range VARCHAR,
    job_type VARCHAR NOT NULL,
    work_mode VARCHAR NOT NULL,
    experience_level VARCHAR NOT NULL,
    department VARCHAR NOT NULL,
    skills_required TEXT,
    status VARCHAR DEFAULT 'Open',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Job Applications Table
```sql
CREATE TABLE job_applications (
    id INTEGER PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id),
    applicant_name VARCHAR NOT NULL,
    applicant_email VARCHAR NOT NULL,
    applicant_phone VARCHAR,
    resume_url VARCHAR,
    cover_letter TEXT,
    experience_years INTEGER,
    current_company VARCHAR,
    current_position VARCHAR,
    expected_salary VARCHAR,
    availability VARCHAR,
    status VARCHAR DEFAULT 'Applied',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Candidate Resumes Table
```sql
CREATE TABLE candidate_resumes (
    id INTEGER PRIMARY KEY,
    candidate_id INTEGER REFERENCES job_applications(id),
    job_id INTEGER REFERENCES jobs(id),
    resume_path VARCHAR NOT NULL,
    original_filename VARCHAR NOT NULL,
    skills TEXT,
    experience_years INTEGER,
    experience_level VARCHAR,
    parsed_text TEXT,
    parsing_status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Configuration

### Environment Variables (.env)
```env
# Database
DATABASE_URL=sqlite:///./ai_interview.db
# For PostgreSQL: postgresql://postgres:password@localhost:5432/ai_interview_db

# JWT Settings
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# File Upload
MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_DIR=./uploads
```

### File Structure
```
backend/
├── main_final.py           # Main server (CURRENT)
├── database.py             # Database configuration
├── models.py               # SQLAlchemy models
├── schemas.py              # Pydantic schemas
├── crud.py                 # Database operations
├── requirements.txt        # Python dependencies
├── .env                    # Environment variables
├── auth/                   # Authentication module
│   ├── app.py             # Auth router
│   ├── jwt_handler.py     # JWT management
│   └── role_manager.py    # Role-based access
├── api/                    # API modules
│   └── candidates/        # Candidate-related APIs
├── services/               # Business logic
├── utils/                  # Utility functions
└── uploads/                # File uploads
    └── resumes/           # Resume files
```

## 🛠️ Troubleshooting

### Common Issues

**1. Database Connection Error**
```bash
# For SQLite (default)
DATABASE_URL=sqlite:///./ai_interview.db

# For PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/ai_interview_db
```

**2. Dependencies Installation Error**
```bash
# Try minimal installation
pip install fastapi uvicorn sqlalchemy pydantic

# Or full installation
pip install -r requirements.txt
```

**3. Port Already in Use**
```bash
# Kill process on port 8000
netstat -ano | findstr :8000
taskkill /PID <PID_NUMBER> /F

# Or use different port
uvicorn main_final:app --port 8001
```

**4. CORS Issues**
- Frontend CORS is enabled for localhost:3000, localhost:3001, localhost:5173
- Add your frontend URL to CORS origins in main_final.py

**5. File Upload Issues**
```bash
# Create upload directory
mkdir -p backend/uploads/resumes

# Check file permissions
# Ensure max file size is 10MB
```

## 🧪 API Testing

### Using Python Requests
```python
import requests

# Test health endpoint
response = requests.get('http://localhost:8000/api/health')
print(response.json())

# Test user signup
data = {
    'username': 'testuser',
    'email': 'test@example.com', 
    'password': 'password123'
}
response = requests.post('http://localhost:8000/api/auth/signup', json=data)
print(response.json())

# Test login
login_data = {'username': 'testuser', 'password': 'password123'}
response = requests.post('http://localhost:8000/api/auth/login', data=login_data)
token = response.json()['access_token']

# Test authenticated endpoint
headers = {'Authorization': f'Bearer {token}'}
response = requests.get('http://localhost:8000/api/auth/me', headers=headers)
print(response.json())
```

### Using cURL
```bash
# Health check
curl http://localhost:8000/api/health

# User signup
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'

# User login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=password123"
```

## 📱 Frontend Integration

### React Integration Example
```javascript
// API base URL
const API_BASE = 'http://localhost:8000';

// Login function
const login = async (username, password) => {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${username}&password=${password}`
  });
  
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('userRole', data.role);
  return data;
};

// Authenticated API call
const getJobs = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/api/jobs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Role-based UI rendering
const renderByRole = (userRole) => {
  switch(userRole) {
    case 'admin':
      return <AdminDashboard />;
    case 'recruiter':
      return <RecruiterDashboard />;
    case 'candidate':
      return <CandidateDashboard />;
    default:
      return <LoginForm />;
  }
};
```

## 🎯 API Documentation

Once server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/api/health

## 🔄 Database Migration

### From SQLite to PostgreSQL
1. **Backup SQLite data** (optional)
2. **Install PostgreSQL** and create database
3. **Update .env file** with PostgreSQL URL
4. **Restart server** - tables will be created automatically

### From PostgreSQL to SQLite
1. **Update .env file**: `DATABASE_URL=sqlite:///./ai_interview.db`
2. **Restart server** - SQLite database will be created

## 🎉 Success Indicators

You'll know everything is working when:

✅ **Server starts successfully**:
```
🚀 Starting AI Interview Platform API...
✅ Database tables created
✅ Resume and Candidate Matching endpoints included
✅ Job Application endpoints included
✅ Auth Router included
INFO: Uvicorn running on http://0.0.0.0:8000
```

✅ **API responds**:
- Health check returns 200 OK
- Swagger docs load at /docs
- User signup/login works

✅ **Database works**:
- Tables created automatically
- User registration saves to database
- Job creation and application flow works

✅ **Frontend integration**:
- CORS allows frontend connections
- Authentication tokens work
- Role-based access control functions

## 🚀 Production Deployment

### Security Checklist
- [ ] Change default SECRET_KEY
- [ ] Use strong database passwords
- [ ] Enable HTTPS/SSL
- [ ] Set up proper CORS origins
- [ ] Configure file upload limits
- [ ] Set up database backups
- [ ] Enable logging and monitoring

### Environment Setup
```env
# Production settings
DATABASE_URL=postgresql://user:password@prod-db:5432/ai_interview_db
SECRET_KEY=your-super-secret-production-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=60
DEBUG=false
```

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Ensure database is running (for PostgreSQL)
4. Check server logs for error messages
5. Test with minimal setup first (Ultra Simple Setup)

The backend is designed to work with minimal configuration and provides comprehensive error messages to help with debugging.