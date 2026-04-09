// Test Video Upload — upload recordings to test fraud detection pipeline
import React, { useState, useEffect } from 'react'
import {
  Box, Typography, Button, CircularProgress,
  FormControl, Select, MenuItem, InputLabel, Alert, TextField,
} from '@mui/material'
import { CheckCircle, Upload } from '@mui/icons-material'
import { apiClient } from '../../services/api'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Navigation from '../layout/Sidebar'

interface JobOption {
  id: number
  title: string
}

interface CandidateOption {
  id: number
  name: string
  email: string
  type: string
}

const TestVideoUpload: React.FC = () => {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [result, setResult] = useState<any>(null)
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
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    apiClient.get('/api/video/test/status').then(r => setEnabled(r.data.enabled)).catch(() => setEnabled(false))
    apiClient.get('/api/video/test/jobs')
      .then(r => { setJobs(r.data); setLoadingJobs(false) })
      .catch(() => setLoadingJobs(false))
  }, [])

  // Fetch candidates when job changes
  useEffect(() => {
    if (!selectedJobId) { setCandidates([]); setSelectedCandidateId(''); return }
    setLoadingCandidates(true)
    apiClient.get(`/api/video/test/candidates?job_id=${selectedJobId}`)
      .then(r => { setCandidates(r.data); setLoadingCandidates(false) })
      .catch(() => { setCandidates([]); setLoadingCandidates(false) })
  }, [selectedJobId])

  const pollStatus = async (videoInterviewId: number, initialData: any) => {
    setProcessing(true)
    setProcessingStep('Extracting audio & generating transcript...')

    const poll = async (): Promise<any> => {
      try {
        const res = await apiClient.get(`/api/video/test/processing-status/${videoInterviewId}`)
        const data = res.data

        if (data.transcript === 'processing') {
          setProcessingStep(data.transcript_step || 'Extracting audio & generating transcript...')
        } else if (data.fraud === 'processing') {
          setProcessingStep('Running fraud analysis on video...')
        } else if (data.scoring === 'processing') {
          setProcessingStep('Generating AI score from transcript...')
        } else if (data.transcript === 'completed' && data.fraud === 'pending') {
          setProcessingStep('Transcript done! Starting fraud analysis...')
        }

        if (data.status === 'completed' || data.status === 'failed') {
          return {
            ...initialData,
            status: 'completed',
            transcript_generated: data.transcript_generated,
            transcript_length: data.transcript_length || 0,
            transcript_error: data.transcript_error,
            fraud_analysis_done: data.fraud_analysis_done || false,
            scoring_done: data.scoring_done || false,
            overall_score: data.overall_score,
            recommendation: data.recommendation,
          }
        }
        // Wait 3 seconds and poll again
        await new Promise(r => setTimeout(r, 3000))
        return poll()
      } catch {
        return { ...initialData, status: 'completed', transcript_generated: false, fraud_analysis_done: false }
      }
    }

    const finalResult = await poll()
    setResult(finalResult)
    setProcessing(false)
    setProcessingStep('')
    if (finalResult.scoring_done) {
      toast.success(`Score generated: ${(finalResult.overall_score / 10).toFixed(1)}/10`)
    } else if (finalResult.transcript_generated) {
      toast.success('Transcript generated successfully!')
    } else {
      toast.error('Transcript generation failed')
    }
  }

  const handleUpload = async () => {
    if (!file || !selectedJobId) return
    const USE_CLOUD_UPLOAD = file.size > 25 * 1024 * 1024 // Use Cloudinary for files > 25MB
    setUploading(true)
    setResult(null)
    try {
      let candidateId = candidateMode === 'existing' ? selectedCandidateId : ''

      // Step 1: Create new candidate if needed
      if (candidateMode === 'new') {
        if (!newCandidateName.trim() || !newCandidateEmail.trim()) {
          toast.error('Please fill candidate name and email')
          setUploading(false)
          return
        }
        setCreatingCandidate(true)
        const candidateFd = new FormData()
        candidateFd.append('name', newCandidateName.trim())
        candidateFd.append('email', newCandidateEmail.trim())
        if (resume) candidateFd.append('resume', resume)
        const candRes = await apiClient.post(`/api/recruiter/job/${selectedJobId}/add-candidate`, candidateFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        })
        candidateId = candRes.data.application_id || candRes.data.id || ''
        setCreatingCandidate(false)
        toast.success('Candidate created!')
        // Refresh candidate list
        apiClient.get(`/api/video/test/candidates?job_id=${selectedJobId}`)
          .then(r => setCandidates(r.data)).catch(() => {})
      }

      // Step 2: Upload video
      let response: any
      if (USE_CLOUD_UPLOAD) {
        // Large file — upload directly to Cloudinary with progress tracking
        setUploadProgress(0)
        const params = await apiClient.get('/api/video/test/upload-params')
        const { cloud_name, api_key, timestamp, signature, folder } = params.data

        const cloudFd = new FormData()
        cloudFd.append('file', file)
        cloudFd.append('api_key', api_key)
        cloudFd.append('timestamp', String(timestamp))
        cloudFd.append('signature', signature)
        cloudFd.append('folder', folder)
        cloudFd.append('resource_type', 'video')

        // Use XMLHttpRequest for upload progress (fetch doesn't support it)
        const videoUrl: string = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`)
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const data = JSON.parse(xhr.responseText)
              resolve(data.secure_url)
            } else {
              reject(new Error(`Cloud upload failed (${xhr.status})`))
            }
          }
          xhr.onerror = () => reject(new Error('Cloud upload network error'))
          xhr.send(cloudFd)
        })

        // Send URL to backend (no file transfer through Cloud Run)
        const urlFd = new FormData()
        urlFd.append('video_url', videoUrl)
        urlFd.append('job_id', String(selectedJobId))
        if (candidateId) urlFd.append('candidate_id', String(candidateId))
        response = await apiClient.post('/api/video/test/upload-interview-url', urlFd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        })
      } else {
        // Small file — direct upload to backend
        const fd = new FormData()
        fd.append('file', file)
        fd.append('job_id', String(selectedJobId))
        if (candidateId) fd.append('candidate_id', String(candidateId))
        response = await apiClient.post('/api/video/test/upload-interview', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
        })
      }
      setUploading(false)
      toast.success('Video uploaded! Processing transcript & scoring...')
      // Start polling for background processing
      pollStatus(response.data.video_interview_id, response.data)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
      setUploading(false)
      setCreatingCandidate(false)
    }
  }

  if (enabled === null) return <Navigation><Box sx={{ p: 4 }}><CircularProgress /></Box></Navigation>
  if (!enabled) return <Navigation><Box sx={{ p: 4 }}><Typography>Test video upload is disabled.</Typography></Box></Navigation>

  return (
    <Navigation>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 700 }}>
        <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
          Test Video Upload
        </Typography>
        <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>
          Upload a video to create an interview record with transcript, scoring &amp; fraud analysis
        </Typography>

        {/* Job Selector */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="job-select-label">Select Job *</InputLabel>
          <Select
            labelId="job-select-label"
            value={selectedJobId}
            label="Select Job *"
            onChange={e => { setSelectedJobId(e.target.value as number); setSelectedCandidateId('') }}
            disabled={loadingJobs}
            sx={{
              borderRadius: '10px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
            }}
          >
            {jobs.map(j => (
              <MenuItem key={j.id} value={j.id}>{j.title}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Candidate Selector */}
        {selectedJobId && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button
                size="small"
                variant={candidateMode === 'existing' ? 'contained' : 'outlined'}
                onClick={() => setCandidateMode('existing')}
                sx={{
                  textTransform: 'none', borderRadius: '8px', fontSize: '12px',
                  ...(candidateMode === 'existing'
                    ? { background: '#020291', '&:hover': { background: '#01016e' } }
                    : { borderColor: '#e2e8f0', color: '#64748b' })
                }}
              >
                Existing Candidate
              </Button>
              <Button
                size="small"
                variant={candidateMode === 'new' ? 'contained' : 'outlined'}
                onClick={() => setCandidateMode('new')}
                sx={{
                  textTransform: 'none', borderRadius: '8px', fontSize: '12px',
                  ...(candidateMode === 'new'
                    ? { background: '#020291', '&:hover': { background: '#01016e' } }
                    : { borderColor: '#e2e8f0', color: '#64748b' })
                }}
              >
                New Candidate
              </Button>
            </Box>

            {candidateMode === 'existing' ? (
              <FormControl fullWidth>
                <InputLabel id="candidate-select-label">Select Candidate</InputLabel>
                <Select
                  labelId="candidate-select-label"
                  value={selectedCandidateId}
                  label="Select Candidate"
                  onChange={e => setSelectedCandidateId(e.target.value as number)}
                  disabled={loadingCandidates}
                  sx={{
                    borderRadius: '10px',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cbd5e1' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                  }}
                >
                  {candidates.length === 0 && !loadingCandidates && (
                    <MenuItem disabled>No candidates found for this job</MenuItem>
                  )}
                  {candidates.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth size="small" label="Candidate Name *"
                    value={newCandidateName}
                    onChange={e => setNewCandidateName(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                  <TextField
                    fullWidth size="small" label="Candidate Email *"
                    value={newCandidateEmail}
                    onChange={e => setNewCandidateEmail(e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                </Box>
                <Box
                  sx={{
                    border: '1px dashed #cbd5e1', borderRadius: '10px', p: 1.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer',
                    '&:hover': { borderColor: '#020291', background: '#f8fafc' },
                  }}
                  onClick={() => document.getElementById('resume-input')?.click()}
                >
                  <input
                    id="resume-input" type="file" hidden
                    accept=".pdf,.doc,.docx"
                    onChange={e => setResume(e.target.files?.[0] || null)}
                  />
                  <Typography sx={{ fontSize: '13px', color: resume ? '#16a34a' : '#94a3b8' }}>
                    {resume ? resume.name : 'Upload Resume (optional) — PDF, DOC, DOCX'}
                  </Typography>
                  {resume && (
                    <Typography
                      sx={{ fontSize: '12px', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                      onClick={(e) => { e.stopPropagation(); setResume(null) }}
                    >
                      Remove
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* File Upload */}
        <Box
          sx={{
            border: '2px dashed #cbd5e1', borderRadius: '12px', p: 3,
            textAlign: 'center', mb: 2, cursor: 'pointer',
            '&:hover': { borderColor: '#020291', background: '#f8fafc' },
          }}
          onClick={() => document.getElementById('test-video-input')?.click()}
        >
          <input
            id="test-video-input" type="file" hidden
            accept=".mp4,.webm,.mp3,.wav,.m4a,.ogg,.flac"
            onChange={e => { setFile(e.target.files?.[0] || null); setResult(null) }}
          />
          {file ? (
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>{file.name}</Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{(file.size / (1024 * 1024)).toFixed(2)} MB</Typography>
            </Box>
          ) : (
            <Box>
              <Upload sx={{ fontSize: 32, color: '#94a3b8', mb: 1 }} />
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Click to select video file</Typography>
              <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>mp4, webm, mp3, wav (max 30 MB)</Typography>
            </Box>
          )}
        </Box>

        <Button
          onClick={handleUpload}
          disabled={!file || !selectedJobId || uploading || processing || creatingCandidate || !!result}
          fullWidth
          sx={{
            background: '#020291', color: 'white', borderRadius: '10px',
            textTransform: 'none', fontWeight: 600, height: 48, mb: 3,
            '&:hover': { background: '#06109E' },
            '&:disabled': { opacity: 0.5, color: 'white', background: '#020291' },
          }}
        >
          {creatingCandidate ? (
            <>
              <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} />
              Creating candidate...
            </>
          ) : uploading ? (
            <>
              <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} />
              {uploadProgress > 0 ? `Uploading to cloud... ${uploadProgress}%` : 'Uploading video...'}
            </>
          ) : processing ? (
            <>
              <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} />
              {processingStep || 'Processing...'}
            </>
          ) : (
            'Upload & Create Interview'
          )}
        </Button>

        {uploading && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '10px' }}>
            {uploadProgress > 0
              ? `Uploading to cloud... ${uploadProgress}% (${(file!.size / (1024 * 1024)).toFixed(1)} MB)`
              : 'Uploading video file to server...'}
          </Alert>
        )}

        {processing && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '10px' }}>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, mb: 0.5 }}>{processingStep}</Typography>
            <Typography sx={{ fontSize: '12px', color: '#475569' }}>
              Video size: {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Unknown'}
              {file && file.size > 50 * 1024 * 1024
                ? ' — Large file, this may take 3-5 minutes.'
                : file && file.size > 20 * 1024 * 1024
                ? ' — This may take 1-3 minutes.'
                : ' — This should take under a minute.'}
              {' '}You can wait
            </Typography>
          </Alert>
        )}

        {/* Result */}
        {result && (
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '12px', p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <CheckCircle sx={{ color: '#16a34a', fontSize: 28 }} />
              <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>
                Interview Created
              </Typography>
            </Box>

            {/* Score highlight */}
            {result.scoring_done && (
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                p: 2, mb: 2, borderRadius: '10px',
                background: result.overall_score >= 75 ? '#ecfdf5' : result.overall_score >= 50 ? '#fffbeb' : '#fef2f2',
              }}>
                <Typography sx={{
                  fontSize: '32px', fontWeight: 800,
                  color: result.overall_score >= 75 ? '#16a34a' : result.overall_score >= 50 ? '#d97706' : '#dc2626',
                }}>
                  {(result.overall_score / 10).toFixed(1)}/10
                </Typography>
                <Box>
                  <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                    {result.recommendation === 'select' ? 'Selected' : result.recommendation === 'next_round' ? 'Next Round' : 'Rejected'}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>AI Score</Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
              <InfoRow label="Candidate" value={result.candidate_name || 'Unknown'} />
              <InfoRow label="Job" value={result.job_title} />
              <InfoRow label="File Size" value={`${result.file_size_mb} MB`} />
              <InfoRow
                label="Transcript"
                value={result.transcript_generated ? `Generated (${result.transcript_length} chars)` : 'Failed'}
                color={result.transcript_generated ? '#16a34a' : '#dc2626'}
              />
              {result.transcript_error && (
                <InfoRow label="Transcript Error" value={result.transcript_error} color="#dc2626" />
              )}
              <InfoRow
                label="Fraud Analysis"
                value={result.fraud_analysis_done ? 'Completed' : 'Skipped'}
                color={result.fraud_analysis_done ? '#16a34a' : '#f59e0b'}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={() => navigate(`/video-detail/${result.video_interview_id}`)}
                sx={{
                  background: '#020291', borderRadius: '10px', textTransform: 'none',
                  fontWeight: 600, height: 44, '&:hover': { background: '#06109E' },
                }}
              >
                Open Interview
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate(`/fraud-analysis/${result.video_interview_id}`)}
                sx={{
                  borderColor: '#dc6b09', color: '#dc6b09', borderRadius: '10px',
                  textTransform: 'none', fontWeight: 600, height: 44,
                  '&:hover': { borderColor: '#b45a07', background: '#fff7ed' },
                }}
              >
                View Fraud Analysis
              </Button>
            </Box>

            {/* New Upload button */}
            <Button
              fullWidth
              onClick={() => { setResult(null); setFile(null); setSelectedCandidateId(''); setNewCandidateName(''); setNewCandidateEmail(''); setResume(null) }}
              sx={{
                mt: 1.5, color: '#64748b', textTransform: 'none', fontSize: '13px',
                '&:hover': { background: '#f8fafc' },
              }}
            >
              Upload Another Video
            </Button>
          </Box>
        )}
      </Box>
    </Navigation>
  )
}

const InfoRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{label}</Typography>
    <Typography sx={{ fontSize: '13px', fontWeight: 600, color: color || '#1e293b' }}>{value}</Typography>
  </Box>
)

export default TestVideoUpload
