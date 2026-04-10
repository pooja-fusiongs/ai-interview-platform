// Test Video Upload — upload recordings to test fraud detection pipeline
import React, { useState, useEffect } from 'react'
import {
  Box, Typography, Button, CircularProgress,
  FormControl, Select, MenuItem, TextField,
  LinearProgress, Chip, IconButton, Divider,
} from '@mui/material'
import {
  CheckCircle, CloudUpload, VideoFile,
  Security, ArrowForward, AttachFile, Close,
  InsertDriveFile, ArrowBack,
} from '@mui/icons-material'
import { apiClient } from '../../services/api'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Navigation from '../layout/Sidebar'
import { useUpload } from '../../contexts/UploadContext'

interface JobOption { id: number; title: string }
interface CandidateOption { id: number; name: string; email: string; type: string }

const TestVideoUpload: React.FC = () => {
  const navigate = useNavigate()
  const upload = useUpload()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | ''>('')
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [candidates, setCandidates] = useState<CandidateOption[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | ''>('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [candidateMode, setCandidateMode] = useState<'existing' | 'new'>('existing')
  const [newCandidateName, setNewCandidateName] = useState('')
  const [newCandidateEmail, setNewCandidateEmail] = useState('')
  const [resume, setResume] = useState<File | null>(null)
  const [creatingCandidate, setCreatingCandidate] = useState(false)

  // Ref for auto-refresh (must be before any early returns)
  const refreshedRef = React.useRef(false)

  // Derive from context
  const uploading = upload.state.status === 'uploading'
  const processing = upload.state.status === 'processing'
  const uploadProgress = upload.state.progress
  const processingStep = upload.state.processingStep
  const result = upload.state.result

  useEffect(() => {
    apiClient.get('/api/video/test/status').then(r => setEnabled(r.data.enabled)).catch(() => setEnabled(false))
    apiClient.get('/api/video/test/jobs').then(r => { setJobs(r.data); setLoadingJobs(false) }).catch(() => setLoadingJobs(false))
  }, [])

  useEffect(() => {
    if (!selectedJobId) { setCandidates([]); setSelectedCandidateId(''); return }
    setLoadingCandidates(true)
    apiClient.get(`/api/video/test/candidates?job_id=${selectedJobId}`)
      .then(r => { setCandidates(r.data); setLoadingCandidates(false) })
      .catch(() => { setCandidates([]); setLoadingCandidates(false) })
  }, [selectedJobId])

  const handleUpload = async () => {
    if (!file || !selectedJobId) return
    const USE_CLOUD_UPLOAD = file.size > 25 * 1024 * 1024
    upload.reset()
    try {
      // Save form info to context so it shows when navigating back
      const selectedJob = jobs.find(j => j.id === selectedJobId)
      const selectedCandidate = candidates.find(c => c.id === selectedCandidateId)
      upload.setFormInfo({
        jobTitle: selectedJob?.title || '',
        candidateName: candidateMode === 'new' ? newCandidateName : (selectedCandidate?.name || ''),
        candidateMode,
      })

      let candidateId = candidateMode === 'existing' ? selectedCandidateId : ''
      if (candidateMode === 'new') {
        if (!newCandidateName.trim() || !newCandidateEmail.trim()) { toast.error('Please fill candidate name and email'); return }
        setCreatingCandidate(true)
        const candidateFd = new FormData()
        candidateFd.append('name', newCandidateName.trim()); candidateFd.append('email', newCandidateEmail.trim())
        if (resume) candidateFd.append('resume', resume)
        const candRes = await apiClient.post(`/api/recruiter/job/${selectedJobId}/add-candidate`, candidateFd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
        candidateId = candRes.data.application_id || candRes.data.id || ''
        setCreatingCandidate(false); toast.success('Candidate created!')
        apiClient.get(`/api/video/test/candidates?job_id=${selectedJobId}`).then(r => setCandidates(r.data)).catch(() => {})
      }
      let response: any
      if (USE_CLOUD_UPLOAD) {
        const params = await apiClient.get('/api/video/test/upload-params')
        const { cloud_name, api_key, timestamp, signature, folder } = params.data
        const videoUrl = await upload.startCloudUpload(file, cloud_name, api_key, String(timestamp), signature, folder)
        response = await upload.startUrlUpload(videoUrl, selectedJobId as number, candidateId)
      } else {
        response = await upload.startDirectUpload(file, selectedJobId as number, candidateId)
      }
      toast.success('Video uploaded! Processing...')
      const initialData = { ...response, file_size_mb: response.file_size_mb || (file ? (file.size / (1024 * 1024)).toFixed(2) : null) }
      upload.startPolling(response.video_interview_id, initialData)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || err.message || 'Upload failed')
      upload.setError(err.message || 'Upload failed')
      setCreatingCandidate(false)
    }
  }

  const handleReset = () => { upload.reset(); setFile(null); setSelectedCandidateId(''); setNewCandidateName(''); setNewCandidateEmail(''); setResume(null); refreshedRef.current = false }

  // Auto-refresh stale result - must be before early returns (React hooks rule)
  useEffect(() => {
    const viId = result?.video_interview_id
    if (!viId || refreshedRef.current) return
    const allDone = result?.scoring_done && result?.transcript_generated && result?.fraud_analysis_done
    if (allDone) return
    refreshedRef.current = true
    let retries = 0
    const maxRetries = 4
    const interval = setInterval(async () => {
      retries++
      if (retries > maxRetries) { clearInterval(interval); return }
      try {
        const res = await apiClient.get(`/api/video/test/processing-status/${viId}`)
        const d = res.data
        const hasNew = (d.scoring_done && !result?.scoring_done) || (d.transcript_generated && !result?.transcript_generated) || (d.fraud_analysis_done && !result?.fraud_analysis_done)
        if (hasNew) {
          upload.setResult({
            ...result,
            transcript_generated: d.transcript_generated || result.transcript_generated,
            transcript_length: d.transcript_length || result.transcript_length,
            scoring_done: d.scoring_done || result.scoring_done,
            overall_score: d.overall_score || result.overall_score,
            recommendation: d.recommendation || result.recommendation,
            fraud_analysis_done: d.fraud_analysis_done || result.fraud_analysis_done,
          })
          clearInterval(interval)
        }
      } catch { /* ignore */ }
    }, 8000)
    return () => clearInterval(interval)
  }, [result?.video_interview_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (enabled === null) return <Navigation><Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><CircularProgress sx={{ color: '#020291' }} /></Box></Navigation>
  if (!enabled) return <Navigation><Box sx={{ p: 4 }}><Typography>Test video upload is disabled.</Typography></Box></Navigation>

  const isProcessing = uploading || processing || creatingCandidate
  const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px', backgroundColor: 'white', '& fieldset': { borderColor: '#e2e8f0' }, '&:hover fieldset': { borderColor: '#020291' }, '&.Mui-focused fieldset': { borderColor: '#020291', boxShadow: '0 0 0 3px rgba(2,2,145,0.08)' } }, '& .MuiOutlinedInput-input': { padding: '12px 16px', fontSize: '14px' } }
  const selectSx = { borderRadius: '8px', '& fieldset': { borderColor: '#e2e8f0' }, '&:hover fieldset': { borderColor: '#020291' }, '&.Mui-focused fieldset': { borderColor: '#020291', boxShadow: '0 0 0 3px rgba(2,2,145,0.08)' } }

  if (result) {
    const score = result.scoring_done ? (result.overall_score / 10).toFixed(1) : null
    const scoreColor = result.overall_score >= 75 ? '#16a34a' : result.overall_score >= 50 ? '#d97706' : '#dc2626'
    const steps = [
      { label: 'Uploaded', done: true },
      { label: 'Transcript', done: result.transcript_generated },
      { label: 'Scored', done: result.scoring_done },
      { label: 'Fraud Check', done: result.fraud_analysis_done },
    ]
    return (
      <Navigation>
        <Box sx={{ maxWidth: 580, mx: 'auto', py: { xs: 3, md: 5 }, px: { xs: 2, md: 0 } }}>
          <Button onClick={handleReset} sx={{ textTransform: 'none', fontWeight: 500, fontSize: '13px', color: '#64748b', mb: 2, '&:hover': { color: '#020291', background: 'transparent' } }}>
            <ArrowBack sx={{ fontSize: 16, mr: 0.5 }} /> Upload another video
          </Button>

          {/* Success banner */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <CheckCircle sx={{ color: '#16a34a', fontSize: 28 }} />
            <Box>
              <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>Interview Created</Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>{result.candidate_name || 'Candidate'} - {result.job_title}</Typography>
            </Box>
          </Box>

          {/* Score card */}
          {result.scoring_done && (
            <Box sx={{ p: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', mb: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Box sx={{ width: 72, height: 72, borderRadius: '50%', border: `3px solid ${scoreColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '24px', fontWeight: 800, color: scoreColor }}>{score}</Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>AI Score: {score}/10</Typography>
                  <Chip size="small" label={result.recommendation === 'select' ? 'Selected' : result.recommendation === 'next_round' ? 'Next Round' : 'Rejected'}
                    sx={{ fontWeight: 600, fontSize: '11px', height: 22, background: result.recommendation === 'select' ? '#dcfce7' : result.recommendation === 'next_round' ? '#EEF0FF' : '#fee2e2', color: result.recommendation === 'select' ? '#166534' : result.recommendation === 'next_round' ? '#020291' : '#991b1b' }} />
                </Box>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Based on transcript analysis of {result.transcript_length?.toLocaleString() || 0} characters</Typography>
              </Box>
            </Box>
          )}

          {/* Details card */}
          <Box sx={{ p: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', mb: 2 }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: 2 }}>Details</Typography>
            {[
              { label: 'Candidate', value: result.candidate_name || 'Unknown' },
              { label: 'Job Position', value: result.job_title },
              { label: 'AI Score', value: result.scoring_done ? `${(result.overall_score / 10).toFixed(1)}/10 (${result.recommendation === 'select' ? 'Selected' : result.recommendation === 'next_round' ? 'Next Round' : 'Rejected'})` : 'Processing...', color: result.scoring_done ? '#16a34a' : '#d97706' },
              { label: 'File Size', value: result.file_size_mb ? `${result.file_size_mb} MB` : 'N/A' },
              { label: 'Transcript', value: result.transcript_generated ? `Generated (${result.transcript_length?.toLocaleString()} chars)` : 'Failed', color: result.transcript_generated ? '#16a34a' : '#dc2626' },
              { label: 'Fraud Analysis', value: result.fraud_analysis_done ? 'Completed' : 'Pending', color: result.fraud_analysis_done ? '#16a34a' : '#d97706' },
            ].map((row, i) => (
              <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{row.label}</Typography>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: row.color || '#1e293b' }}>{row.value}</Typography>
              </Box>
            ))}
          </Box>

          {/* Pipeline */}
          <Box sx={{ p: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', mb: 2 }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: 2 }}>Processing Pipeline</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {steps.map((step, i) => (
                <React.Fragment key={i}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <Box sx={{
                      width: 28, height: 28, borderRadius: '50%', mb: 0.5,
                      background: step.done ? '#020291' : '#f1f5f9',
                      border: step.done ? 'none' : '2px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {step.done && <CheckCircle sx={{ fontSize: 16, color: 'white' }} />}
                    </Box>
                    <Typography sx={{ fontSize: '11px', fontWeight: 600, color: step.done ? '#020291' : '#94a3b8' }}>{step.label}</Typography>
                  </Box>
                  {i < steps.length - 1 && (
                    <Box sx={{ width: 40, height: 2, background: step.done && steps[i + 1].done ? '#020291' : '#e2e8f0', mt: -2, borderRadius: 1 }} />
                  )}
                </React.Fragment>
              ))}
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button fullWidth variant="contained" endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
              onClick={() => navigate(`/video-detail/${result.video_interview_id}`)}
              sx={{ background: '#020291', borderRadius: '8px', textTransform: 'none', fontWeight: 600, height: 44, '&:hover': { background: '#06109E' } }} >
              View Interview
            </Button>
            <Button fullWidth variant="outlined" endIcon={<Security sx={{ fontSize: 16 }} />}
              onClick={() => window.open(`/fraud-analysis/${result.video_interview_id}`, '_blank')}
              sx={{ borderColor: '#e2e8f0', color: '#475569', borderRadius: '8px', textTransform: 'none', fontWeight: 600, height: 44, '&:hover': { borderColor: '#020291', color: '#020291' } }} >
              Fraud Analysis
            </Button>
          </Box>
        </Box>
      </Navigation>
    )
  }

  // If navigated back during upload/processing (local form state lost, context still active)
  const contextActive = (uploading || processing) && !file && !selectedJobId
  if (contextActive) {
    return (
      <Navigation>
        <Box sx={{ maxWidth: 580, mx: 'auto', py: { xs: 3, md: 5 }, px: { xs: 2, md: 0 } }}>
          <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#111827', mb: '4px' }}>Upload Interview</Typography>
          <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>Upload a video recording for AI transcript, scoring & fraud analysis</Typography>

          <Box sx={{ p: { xs: '20px', md: '28px' }, borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Form summary */}
            {upload.state.formInfo && (
              <>
                <Box>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Job Position</Typography>
                  <Box sx={{ p: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontSize: '14px', color: '#1e293b' }}>{upload.state.formInfo.jobTitle || '-'}</Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Candidate</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{
                      px: 1.5, py: 0.4, borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                      background: '#020291', color: 'white',
                    }}>
                      {upload.state.formInfo.candidateMode === 'new' ? 'New' : 'Existing'}
                    </Box>
                  </Box>
                  <Box sx={{ p: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontSize: '14px', color: '#1e293b' }}>{upload.state.formInfo.candidateName || '-'}</Typography>
                  </Box>
                </Box>
                <Divider />
              </>
            )}

            {/* File info */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Video Recording</Typography>
              {upload.state.fileName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '12px 16px', background: '#EEF0FF', borderRadius: '8px', border: '1px solid #020291' }}>
                  <VideoFile sx={{ color: '#020291', fontSize: 20 }} />
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{upload.state.fileName}</Typography>
                    {upload.state.fileSizeMb && <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{upload.state.fileSizeMb} MB</Typography>}
                  </Box>
                </Box>
              )}
            </Box>

            {/* Progress */}
            {uploading && uploadProgress > 0 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Uploading to cloud...</Typography>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#020291' }}>{uploadProgress}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 4, borderRadius: 2, backgroundColor: '#EEF0FF', '& .MuiLinearProgress-bar': { borderRadius: 2, backgroundColor: '#020291' } }} />
              </Box>
            )}

            {processing && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <CircularProgress size={16} sx={{ color: '#16a34a' }} />
                <Typography sx={{ fontSize: '13px', color: '#166534', fontWeight: 500 }}>{processingStep}</Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              Processing continues in background. You can navigate to other pages.
            </Typography>
          </Box>
        </Box>
      </Navigation>
    )
  }

  // Upload form view
  return (
    <Navigation>
      <Box sx={{ maxWidth: 580, mx: 'auto', py: { xs: 3, md: 5 }, px: { xs: 2, md: 0 } }}>
        <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#111827', mb: '4px' }}>
          Upload Interview
        </Typography>
        <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>
          Upload a video recording for AI transcript, scoring & fraud analysis
        </Typography>

        <Box sx={{ p: { xs: '20px', md: '28px' }, borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Job */}
          <Box>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
              Job Position <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <FormControl fullWidth size="small">
              <Select value={selectedJobId} displayEmpty onChange={e => { setSelectedJobId(e.target.value as number); setSelectedCandidateId('') }} disabled={loadingJobs} sx={selectSx}
                renderValue={(val) => val ? jobs.find(j => j.id === val)?.title || '' : <span style={{ color: '#94a3b8' }}>Select a job...</span>}
              >
                {jobs.map(j => <MenuItem key={j.id} value={j.id}>{j.title}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {/* Candidate */}
          {selectedJobId && (
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Candidate</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                {(['existing', 'new'] as const).map(mode => (
                  <Button key={mode} size="small" onClick={() => setCandidateMode(mode)}
                    sx={{
                      textTransform: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 500, px: 2, py: 0.5,
                      background: candidateMode === mode ? '#020291' : 'transparent',
                      color: candidateMode === mode ? 'white' : '#64748b',
                      border: candidateMode === mode ? 'none' : '1px solid #e2e8f0',
                      '&:hover': candidateMode === mode ? { background: '#01016e' } : { borderColor: '#cbd5e1' },
                    }}>
                    {mode === 'existing' ? 'Existing' : 'New Candidate'}
                  </Button>
                ))}
              </Box>
              {candidateMode === 'existing' ? (
                <FormControl fullWidth size="small">
                  <Select value={selectedCandidateId} displayEmpty onChange={e => setSelectedCandidateId(e.target.value as number)} disabled={loadingCandidates} sx={selectSx}
                    renderValue={(val) => val ? candidates.find(c => c.id === val)?.name || '' : <span style={{ color: '#94a3b8' }}>Select candidate...</span>}
                  >
                    {candidates.length === 0 && !loadingCandidates && <MenuItem disabled>No candidates found</MenuItem>}
                    {candidates.map(c => <MenuItem key={c.id} value={c.id}>{c.name} - {c.email}</MenuItem>)}
                  </Select>
                </FormControl>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <TextField fullWidth size="small" placeholder="Full name" value={newCandidateName} onChange={e => setNewCandidateName(e.target.value)} sx={inputSx} />
                    <TextField fullWidth size="small" placeholder="Email address" value={newCandidateEmail} onChange={e => setNewCandidateEmail(e.target.value)} sx={inputSx} />
                  </Box>
                  <Box sx={{
                    border: resume ? '1px solid #020291' : '1px dashed #d1d5db', borderRadius: '8px', px: 2, py: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    background: resume ? '#EEF0FF' : '#fafafa',
                    '&:hover': { borderColor: '#020291' },
                  }} onClick={() => document.getElementById('resume-input')?.click()}>
                    <input id="resume-input" type="file" hidden accept=".pdf,.doc,.docx" onChange={e => setResume(e.target.files?.[0] || null)} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {resume ? <InsertDriveFile sx={{ fontSize: 16, color: '#020291' }} /> : <AttachFile sx={{ fontSize: 16, color: '#9ca3af' }} />}
                      <Typography sx={{ fontSize: '13px', color: resume ? '#020291' : '#9ca3af' }}>{resume ? resume.name : 'Attach resume (optional)'}</Typography>
                    </Box>
                    {resume && <IconButton size="small" onClick={e => { e.stopPropagation(); setResume(null) }}><Close sx={{ fontSize: 14, color: '#9ca3af' }} /></IconButton>}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          <Divider />

          {/* Video file */}
          <Box>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
              Video Recording <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <Box
              sx={{
                border: file ? '1px solid #020291' : '1px dashed #d1d5db', borderRadius: '8px',
                p: file ? '12px 16px' : '28px 16px', textAlign: 'center',
                cursor: isProcessing ? 'default' : 'pointer',
                background: file ? '#EEF0FF' : '#fafafa',
                '&:hover': !file && !isProcessing ? { borderColor: '#020291', background: '#EEF0FF' } : {},
                transition: 'all 0.15s',
              }}
              onClick={() => !isProcessing && document.getElementById('test-video-input')?.click()}
            >
              <input id="test-video-input" type="file" hidden accept=".mp4,.webm,.mp3,.wav,.m4a,.ogg,.flac" onChange={e => { setFile(e.target.files?.[0] || null); upload.reset() }} />
              {file ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <VideoFile sx={{ color: '#020291', fontSize: 20 }} />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</Typography>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{(file.size / (1024 * 1024)).toFixed(2)} MB</Typography>
                    </Box>
                  </Box>
                  {!isProcessing && <IconButton size="small" onClick={e => { e.stopPropagation(); setFile(null) }}><Close sx={{ fontSize: 16, color: '#9ca3af' }} /></IconButton>}
                </Box>
              ) : (
                <>
                  <CloudUpload sx={{ fontSize: 24, color: '#9ca3af', mb: 0.5 }} />
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#6b7280' }}>Click to select video file</Typography>
                  <Typography sx={{ fontSize: '12px', color: '#9ca3af', mt: 0.3 }}>MP4, WebM, MP3, WAV supported</Typography>
                </>
              )}
            </Box>
          </Box>

          {/* Progress indicators */}
          {uploading && uploadProgress > 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Uploading to cloud...</Typography>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#020291' }}>{uploadProgress}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 4, borderRadius: 2, backgroundColor: '#EEF0FF', '& .MuiLinearProgress-bar': { borderRadius: 2, backgroundColor: '#020291' } }} />
            </Box>
          )}

          {processing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <CircularProgress size={16} sx={{ color: '#16a34a' }} />
              <Typography sx={{ fontSize: '13px', color: '#166534', fontWeight: 500 }}>{processingStep}</Typography>
            </Box>
          )}

          {/* Submit */}
          <Button onClick={handleUpload} disabled={!file || !selectedJobId || isProcessing || !!result} fullWidth
            sx={{
              background: '#020291', color: 'white', borderRadius: '8px', textTransform: 'none',
              fontWeight: 600, height: 44, fontSize: '14px',
              '&:hover': { background: '#06109E', boxShadow: '0 0 0 3px rgba(2,2,145,0.08)' },
              '&:disabled': { opacity: 0.4, color: 'white', background: '#020291' },
            }}
          >
            {creatingCandidate ? 'Creating candidate...' : uploading ? (uploadProgress > 0 ? `Uploading... ${uploadProgress}%` : 'Uploading...') : processing ? 'Processing...' : 'Upload & Create Interview'}
          </Button>
        </Box>
      </Box>
    </Navigation>
  )
}

export default TestVideoUpload
