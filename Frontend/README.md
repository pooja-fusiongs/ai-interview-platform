# AI Interview Platform

A full-stack AI-powered interview platform built with React frontend and Python Flask backend.

## Features

- **User Authentication**: Secure login/signup system
- **Job Management**: Create and manage job postings
- **Candidate Management**: Upload and track candidates
- **AI Question Generation**: Generate skill-based interview questions
- **Video Interview Simulation**: Conduct virtual interviews
- **Automated Scoring**: AI-powered answer evaluation
- **Results Dashboard**: Comprehensive interview analytics
- **Responsive Design**: Modern, mobile-friendly UI

## Tech Stack

### Frontend
- React 18
- React Router DOM
- Axios for API calls
- Vite for build tooling
- Modern CSS with gradients and animations

### Backend
- Python Flask
- SQLAlchemy ORM
- JWT Authentication
- SQLite Database
- File Upload Support

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8+
- pip

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the Flask server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

## Usage

1. **Sign Up/Login**: Create an account or use demo access
2. **Create Jobs**: Add job postings with descriptions and requirements
3. **Upload Candidates**: Add candidate profiles with resumes
4. **Generate Questions**: Use AI to create skill-based interview questions
5. **Conduct Interviews**: Run virtual interviews with real-time scoring
6. **Review Results**: Analyze candidate performance and make decisions

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification

### Jobs
- `GET /api/jobs` - Get all jobs
- `POST /api/jobs` - Create new job

### Candidates
- `GET /api/candidates` - Get all candidates
- `POST /api/candidates` - Upload new candidate

### Questions
- `POST /api/questions/generate` - Generate AI questions
- `POST /api/questions/approve` - Approve questions
- `GET /api/questions/approved/:jobId` - Get approved questions

### Interviews
- `GET /api/interviews` - Get all interviews
- `POST /api/interviews` - Submit interview results

## Project Structure

```
ai-interview-platform/
├── src/
│   ├── components/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Navigation.jsx
│   │   ├── JobCreation.jsx
│   │   ├── CandidateUpload.jsx
│   │   ├── AIQuestionGeneration.jsx
│   │   ├── Interview.jsx
│   │   ├── Results.jsx
│   │   └── Candidates.jsx
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── App.jsx
│   ├── main.jsx
│   ├── App.css
│   └── index.css
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── uploads/
├── package.json
├── vite.config.js
└── README.md
```

## Features in Detail

### AI Question Generation
- Automatically generates relevant questions based on job requirements
- Supports multiple job categories (Software Engineer, Data Scientist, Product Manager)
- Allows customization of gold standard answers

### Interview System
- Real-time question presentation
- Answer recording and evaluation
- Progress tracking
- Integrity checks simulation

### Scoring Algorithm
- Keyword matching with gold standard answers
- Length-based scoring for detailed responses
- Automatic candidate status determination

### Modern UI/UX
- Gradient backgrounds and modern design
- Responsive layout for all devices
- Smooth animations and transitions
- Professional color scheme

## Development

### Adding New Features
1. Create React components in `src/components/`
2. Add API endpoints in `backend/app.py`
3. Update database models as needed
4. Add routing in `App.jsx`

### Customization
- Modify `src/App.css` for styling changes
- Update `MOCK_QUESTIONS` in `backend/app.py` for different question sets
- Adjust scoring algorithm in `calculate_answer_score()` function

## Deployment

### Frontend
```bash
npm run build
```

### Backend
Use a WSGI server like Gunicorn:
```bash
pip install gunicorn
gunicorn app:app
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository.