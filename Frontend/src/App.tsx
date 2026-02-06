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

// GDPR Components
import ConsentManager from './components/gdpr/ConsentManager'
import DataExportPage from './components/gdpr/DataExportPage'
import DeletionRequestPage from './components/gdpr/DeletionRequestPage'
import PrivacyNotice from './components/gdpr/PrivacyNotice'
import AdminAuditLog from './components/gdpr/AdminAuditLog'
import AdminRetentionPolicies from './components/gdpr/AdminRetentionPolicies'
import AdminDeletionRequests from './components/gdpr/AdminDeletionRequests'

// ATS Components
import ATSSettings from './components/ats/ATSSettings'
import ATSSyncDashboard from './components/ats/ATSSyncDashboard'
import ATSJobMappings from './components/ats/ATSJobMappings'

// Video Interview Components
import VideoInterviewScheduler from './components/video/VideoInterviewScheduler'
import VideoInterviewList from './components/video/VideoInterviewList'
import VideoInterviewRoom from './components/video/VideoInterviewRoom'
import VideoInterviewDetail from './components/video/VideoInterviewDetail'
import CandidateVideoConsent from './components/video/CandidateVideoConsent'

// Fraud Detection Components
import FraudDashboard from './components/fraud/FraudDashboard'
import FraudAnalysisPanel from './components/fraud/FraudAnalysisPanel'
import RealTimeFlagMonitor from './components/fraud/RealTimeFlagMonitor'

// Post-Hire Feedback Components
import FeedbackForm from './components/feedback/FeedbackForm'
import FeedbackList from './components/feedback/FeedbackList'
import FeedbackDetail from './components/feedback/FeedbackDetail'
import QualityDashboard from './components/feedback/QualityDashboard'
import PerformanceTracker from './components/feedback/PerformanceTracker'
import ScoringRefinementPanel from './components/feedback/ScoringRefinementPanel'

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
            
            {/* AI Questions - Recruiter, Domain Expert, Admin */}
            <Route path="/ai-questions" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin']}>
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
            <Route path="/candidate-profile" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <CandidateProfile />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* GDPR Routes */}
            <Route path="/consent-manager" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <ConsentManager />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/data-export" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <DataExportPage />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/deletion-request" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <DeletionRequestPage />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/privacy-notice" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'domain_expert', 'admin', 'candidate']}>
                  <PrivacyNotice />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin-audit-log" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <AdminAuditLog />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin-retention" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <AdminRetentionPolicies />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/admin-deletion-requests" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <AdminDeletionRequests />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* ATS Routes */}
            <Route path="/ats-settings" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <ATSSettings />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/ats-sync" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <ATSSyncDashboard />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/ats-mappings" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <ATSJobMappings />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* Video Interview Routes */}
            <Route path="/video-scheduler" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <VideoInterviewScheduler />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/video-interviews" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin', 'candidate']}>
                  <VideoInterviewList />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/video-room/:videoId" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin', 'candidate']}>
                  <VideoInterviewRoom />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/video-detail/:videoId" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <VideoInterviewDetail />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/video-consent" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['candidate']}>
                  <CandidateVideoConsent />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* Fraud Detection Routes */}
            <Route path="/fraud-dashboard" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <FraudDashboard />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/fraud-analysis/:videoId" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <FraudAnalysisPanel />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/fraud-monitor" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <RealTimeFlagMonitor />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            {/* Post-Hire Feedback Routes */}
            <Route path="/feedback-form" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <FeedbackForm />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/feedback-list" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <FeedbackList />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/feedback/:feedbackId" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <FeedbackDetail />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/quality-dashboard" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <QualityDashboard />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/performance-tracker" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['recruiter', 'admin']}>
                  <PerformanceTracker />
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />
            <Route path="/scoring-refinement" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['admin']}>
                  <ScoringRefinementPanel />
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