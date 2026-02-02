import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { getDefaultRoute } from './utils/roleUtils'
import Login from './components/auth/signIn'
import SignUp from './components/auth/signUp'
import Dashboard from './components/dashboard/Dashboard'
import Jobs from './components/jobs/Jobs_new'
import JobCreation from './components/jobs/JobCreation'
import CandidateUpload from './components/candidates/CandidateUpload'
import AIQuestionGeneration from './components/interview/AIQuestionGeneration'
import InterviewOutline from './components/interview/InterviewOutline'
import Interview from './components/interview/Interview'
import Results from './components/interview/Results'
import Candidates from './components/candidates/Candidates'
import CandidateMatching from './components/candidates/CandidateMatching'
import CandidateProfile from './components/candidates/CandidateProfile'
import Profile from './components/layout/profile'
import RecruiterCandidates from './components/recruiter/RecruiterCandidates'
import RoleProtectedRoute from './components/common/RoleProtectedRoute'

interface ProtectedRouteProps {
  children: React.ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" />
}

function DefaultRedirect() {
  const { user } = useAuth()
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  const defaultRoute = getDefaultRoute(user?.role)
  
  // Prevent infinite redirect loop
  if (defaultRoute === '/login') {
    return <Navigate to="/login" replace />
  }
  
  return <Navigate to={defaultRoute} replace />
}

function App(): JSX.Element {
  return (
    <AuthProvider>
      <Router>
        <div className="App" style={{ height: '100vh', overflow: 'hidden' }}>
          {/* Toast Notifications */}
          <Toaster
            position="top-right"
            reverseOrder={false}
            gutter={8}
            containerClassName=""
            containerStyle={{}}
            toastOptions={{
              // Default options for all toasts
              className: '',
              duration: 4000,
              style: {
                background: '#fff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: '500',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e5e7eb',
                maxWidth: '400px',
              },
              // Success toast styling
              success: {
                duration: 3000,
                style: {
                  background: '#f0fdf4',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                },
                iconTheme: {
                  primary: '#16a34a',
                  secondary: '#f0fdf4',
                },
              },
              // Error toast styling
              error: {
                duration: 5000,
                style: {
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                },
                iconTheme: {
                  primary: '#dc2626',
                  secondary: '#fef2f2',
                },
              },
              // Loading toast styling
              loading: {
                style: {
                  background: '#fffbeb',
                  color: '#d97706',
                  border: '1px solid #fed7aa',
                },
                iconTheme: {
                  primary: '#f59e0b',
                  secondary: '#fffbeb',
                },
              },
            }}
          />
          
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            
            {/* Default route - redirects to user's default page */}
            <Route path="/" element={<DefaultRedirect />} />
            
            {/* Dashboard - All roles */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <Dashboard />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Jobs - All roles can view, but different access levels */}
            <Route path="/jobs" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <Jobs/>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Job Creation - Recruiter, Admin */}
            <Route path="/job-creation" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <JobCreation />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Candidates - Recruiter, Domain Expert, Admin */}
            <Route path="/candidates" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin']}>
                  <Candidates />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Candidate Matching - Recruiter, Domain Expert, Admin */}
            <Route path="/candidate-matching" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin']}>
                  <CandidateMatching />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Candidate Upload - Recruiter, Admin */}
            <Route path="/candidate-upload" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <CandidateUpload />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* AI Questions - Domain Expert, Admin */}
            <Route path="/ai-questions" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['domain_expert', 'admin']}>
                  <AIQuestionGeneration />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
          
            
            {/* Interview Outline - Domain Expert, Admin, Recruiter */}
            <Route path="/interview-outline/:setId" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['domain_expert', 'admin', 'recruiter']}>
                  <InterviewOutline />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* Recruiter Candidates - Recruiter, Admin */}
            <Route path="/recruiter-candidates" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RecruiterCandidates />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Interview - Candidate */}
            <Route path="/interview" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <Interview />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Results - All authenticated roles */}
            <Route path="/results" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <Results />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Profile - All roles */}
            <Route path="/profile" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <Profile />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            {/* Candidate Profile - Candidate only */}
            <Route path="/candidate-profile" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <CandidateProfile />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            
            
            
            {/* Catch all - redirect to user's default route */}
            <Route path="*" element={
              <ProtectedRoute>
                <DefaultRedirect />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App