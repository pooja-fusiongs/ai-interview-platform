// TEMPORARY TEST FEATURE - Remove after testing
import React, { useState, useEffect } from 'react'
import {
  Box, Typography, Button, CircularProgress, LinearProgress, Chip,
  FormControl, Select, MenuItem, InputLabel, Alert,
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

  useEffect(() => {
    apiClient.get('/api/video/test/status').then(r => setEnabled(r.data.enabled)).catch(() => setEnabled(false))
    apiClient.get('/api/video/test/jobs')
      .then(r => { setJobs(r.data); setLoadingJobs(false) })
      .catch(() => setLoadingJobs(false))
  }, [])

  const pollStatus = async (videoInterviewId: number, initialData: any) => {
    setProcessing(true)
    setProcessingStep('Extracting audio & generating transcript...')

    const poll = async (): Promise<any> => {
      try {
        const res = await apiClient.get(`/api/video/test/processing-status/${videoInterviewId}`)
        const data = res.data

        if (data.transcript === 'processing') {
          setProcessingStep('Extracting audio & generating transcript...')
        } else if (data.fraud === 'processing') {
          setProcessingStep('Running fraud analysis...')
        } else if (data.scoring === 'processing') {
          setProcessingStep('Generating AI score from transcript...')
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
    setUploading(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('job_id', String(selectedJobId))
      const response = await apiClient.post('/api/video/test/upload-interview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      })
      setUploading(false)
      toast.success('Video uploaded! Processing transcript...')
      // Start polling for background processing
      pollStatus(response.data.video_interview_id, response.data)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed')
      setUploading(false)
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
          Upload a video to create an interview record with transcript &amp; fraud analysis — same pipeline as real interviews
        </Typography>

        {/* Job Selector */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="job-select-label">Select Job *</InputLabel>
          <Select
            labelId="job-select-label"
            value={selectedJobId}
            label="Select Job *"
            onChange={e => setSelectedJobId(e.target.value as number)}
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
              <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>mp4, webm, mp3, wav (max 25 MB)</Typography>
            </Box>
          )}
        </Box>

        <Button
          onClick={handleUpload}
          disabled={!file || !selectedJobId || uploading || processing}
          fullWidth
          sx={{
            background: '#020291', color: 'white', borderRadius: '10px',
            textTransform: 'none', fontWeight: 600, height: 48, mb: 3,
            '&:hover': { background: '#06109E' },
            '&:disabled': { opacity: 0.5, color: 'white', background: '#020291' },
          }}
        >
          {uploading ? (
            <>
              <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} />
              Uploading video...
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
            Uploading video file to server...
          </Alert>
        )}

        {processing && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '10px' }}>
            {processingStep} This runs in the background — you can wait or navigate away.
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

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
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
              <InfoRow
                label="AI Score"
                value={result.scoring_done ? `${(result.overall_score / 10).toFixed(1)}/10 — ${result.recommendation === 'select' ? 'Selected' : result.recommendation === 'next_round' ? 'Next Round' : 'Rejected'}` : 'Not generated'}
                color={result.scoring_done ? (result.overall_score >= 75 ? '#16a34a' : result.overall_score >= 50 ? '#f59e0b' : '#dc2626') : '#94a3b8'}
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
                onClick={() => navigate('/video-interviews')}
                sx={{
                  borderColor: '#020291', color: '#020291', borderRadius: '10px',
                  textTransform: 'none', fontWeight: 600, height: 44,
                  '&:hover': { borderColor: '#06109E', background: '#EEF0FF' },
                }}
              >
                View All Interviews
              </Button>
            </Box>
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
