import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Navigation from '../layout/Sidebar'
import axios from 'axios'
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardHeader,
  Alert,
  Paper
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import UploadIcon from '@mui/icons-material/Upload'

interface Job {
  id: number;
  title: string;
}

interface FormData {
  name: string;
  email: string;
  jobId: string;
}

const CandidateUpload: React.FC = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    jobId: ''
  })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    loadJobs()
  }, [])

  const loadJobs = async (): Promise<void> => {
    try {
      const response = await axios.get('/api/jobs')
      setJobs(response.data)
    } catch (error) {
      console.error('Error loading jobs:', error)
      // Demo data fallback
      setJobs([
        { id: 1, title: 'Software Engineer' },
        { id: 2, title: 'Data Scientist' },
        { id: 3, title: 'Product Manager' }
      ])
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSelectChange = (e: any): void => {
    setFormData({
      ...formData,
      jobId: e.target.value
    })
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files
    setResumeFile(files ? files[0] : null)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!resumeFile) {
      setMessage('Please select a resume file.')
      setLoading(false)
      return
    }

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('name', formData.name)
      formDataToSend.append('email', formData.email)
      formDataToSend.append('jobId', formData.jobId)
      formDataToSend.append('resume', resumeFile)

      await axios.post('/api/candidates', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setMessage('Candidate uploaded and associated successfully!')
      setTimeout(() => {
        navigate('/')
      }, 2000)
    } catch (error) {
      setMessage('Error uploading candidate. Please try again.')
      console.error('Error uploading candidate:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Navigation>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          minHeight: 'calc(100vh - 64px)',
          padding: 3
        }}>
          <Paper 
            elevation={3}
            sx={{ 
              width: '100%', 
              maxWidth: 600, 
              borderRadius: 2,
              overflow: 'hidden'
            }}
          >
            <Card>
              <CardHeader
                avatar={<PersonAddIcon sx={{ color: '#1976d2' }} />}
                title={
                  <Typography variant="h5" component="h1" sx={{ fontWeight: 600, color: '#1976d2' }}>
                    Upload Candidate
                  </Typography>
                }
                sx={{ 
                  backgroundColor: '#f8f9fa',
                  borderBottom: '1px solid #e0e0e0'
                }}
              />
              <CardContent sx={{ padding: 3 }}>
                <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <TextField
                    fullWidth
                    label="Candidate Name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter candidate name"
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        '&:hover fieldset': { borderColor: '#1976d2' },
                        '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                      }
                    }}
                  />
                  
                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter candidate email"
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        '&:hover fieldset': { borderColor: '#1976d2' },
                        '&.Mui-focused fieldset': { borderColor: '#1976d2' }
                      }
                    }}
                  />
                  
                  <Box>
                    <Typography variant="body1" sx={{ marginBottom: 1, fontWeight: 500, color: '#333' }}>
                      Resume Upload *
                    </Typography>
                    <Box sx={{
                      border: '2px dashed #e0e0e0',
                      borderRadius: '8px',
                      padding: 3,
                      textAlign: 'center',
                      backgroundColor: '#fafafa',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        borderColor: '#1976d2',
                        backgroundColor: '#f0f7ff'
                      }
                    }}>
                      <input
                        type="file"
                        id="resumeUpload"
                        name="resumeUpload"
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx,.txt"
                        required
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="resumeUpload" style={{ cursor: 'pointer', width: '100%', display: 'block' }}>
                        <UploadIcon sx={{ fontSize: 48, color: '#1976d2', marginBottom: 1 }} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1976d2', marginBottom: 1 }}>
                          {resumeFile ? '✅ Resume Uploaded!' : 'Click to browse or drag and drop'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#666', marginBottom: 0.5 }}>
                          {resumeFile ? resumeFile.name : 'Upload your resume here'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#999' }}>
                          Supported formats: PDF, DOC, DOCX, TXT
                        </Typography>
                      </label>
                    </Box>
                  </Box>
                  
                  <FormControl fullWidth required>
                    <InputLabel id="job-select-label">Associate with Job</InputLabel>
                    <Select
                      labelId="job-select-label"
                      value={formData.jobId}
                      onChange={handleSelectChange}
                      label="Associate with Job"
                      sx={{
                        borderRadius: '8px',
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#1976d2' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1976d2' }
                      }}
                    >
                      <MenuItem value="" disabled>
                        <Typography sx={{ color: '#999' }}>Select Job</Typography>
                      </MenuItem>
                      {jobs.map(job => (
                        <MenuItem key={job.id} value={job.id}>
                          {job.title}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  <Box sx={{ display: 'flex', gap: 2, marginTop: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<ArrowBackIcon />}
                      onClick={() => navigate('/')}
                      sx={{
                        borderRadius: '8px',
                        padding: '12px 24px',
                        textTransform: 'none',
                        fontSize: '16px',
                        fontWeight: 600,
                        borderColor: '#666',
                        color: '#666',
                        '&:hover': {
                          borderColor: '#333',
                          backgroundColor: '#f5f5f5'
                        }
                      }}
                    >
                      Back to Dashboard
                    </Button>
                    <Button
                      fullWidth
                      type="submit"
                      variant="contained"
                      startIcon={<UploadIcon />}
                      disabled={loading}
                      sx={{
                        borderRadius: '8px',
                        padding: '12px 24px',
                        textTransform: 'none',
                        fontSize: '16px',
                        fontWeight: 600,
                        backgroundColor: '#1976d2',
                        '&:hover': {
                          backgroundColor: '#1565c0'
                        },
                        '&:disabled': {
                          backgroundColor: '#ccc'
                        }
                      }}
                    >
                      {loading ? 'Uploading...' : 'Upload & Associate'}
                    </Button>
                  </Box>
                </Box>
                
                {message && (
                  <Alert 
                    severity={message.includes('success') ? 'success' : 'error'}
                    sx={{ 
                      marginTop: 3,
                      borderRadius: '8px',
                      '& .MuiAlert-message': {
                        fontSize: '14px',
                        fontWeight: 500
                      }
                    }}
                  >
                    {message}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Paper>
        </Box>
      </Navigation>
    </Box>
  )
}

export default CandidateUpload