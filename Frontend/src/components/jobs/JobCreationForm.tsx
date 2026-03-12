import React, { useState, useRef } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
} from '@mui/material'
import { Job } from '../../types'
import { showSuccess, showError, showLoading, dismissToast } from '../../utils/toast'
import { apiClient } from '../../services/api'

interface JobCreationFormProps {
  open: boolean;
  onClose: () => void;
  onJobCreate?: (job: Job) => void;
}

const JobCreationForm: React.FC<JobCreationFormProps> = ({ open, onClose, onJobCreate }) => {
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [yearsExperience, setYearsExperience] = useState(0)
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState<Array<{ skill: string; weightage: number }>>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  if (!open) return null

  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'title':
        if (!value.trim()) return 'Job title is required'
        if (value.trim().length < 2) return 'Job title must be at least 2 characters'
        if (value.trim().length > 100) return 'Job title must be less than 100 characters'
        return ''
      case 'company':
        if (!value.trim()) return 'Company name is required'
        if (value.trim().length < 2) return 'Company name must be at least 2 characters'
        if (value.trim().length > 100) return 'Company name must be less than 100 characters'
        return ''
      case 'description':
        if (value.trim() && value.trim().length < 10) return 'Description must be at least 10 characters'
        return ''
      default:
        return ''
    }
  }

  const handleFieldChange = (field: string, value: string, setter: (v: any) => void) => {
    setter(field === 'yearsExperience' ? Math.max(0, Number(value)) : value)
    if (touched[field]) {
      setErrors(prev => ({ ...prev, [field]: validateField(field, value) }))
    }
  }

  const handleBlur = (field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    setErrors(prev => ({ ...prev, [field]: validateField(field, value) }))
  }

  const handleSubmit = async () => {
    // Validate all fields
    const newErrors: Record<string, string> = {
      title: validateField('title', title),
      company: validateField('company', company),
      description: validateField('description', description),
    }
    setErrors(newErrors)
    setTouched({ title: true, company: true, description: true })

    const hasErrors = Object.values(newErrors).some(e => e !== '')
    if (hasErrors) {
      showError('Please fix the errors before submitting')
      return
    }

    const validSkills = skills.filter(s => s.skill.trim() && s.weightage > 0)
    if (validSkills.length > 0) {
      const total = validSkills.reduce((acc, cur) => acc + cur.weightage, 0)
      if (Math.round(total) !== 100) {
        showError('Skill weightage total must be 100%')
        return
      }
    }

    const loadingToast = showLoading('Creating job...')
    setLoading(true)
    try {
      const jobPayload: Record<string, any> = {
        title,
        company,
        description: description || '',
        experience_level: yearsExperience > 0 ? `${yearsExperience} Years` : '',
        skills_required: validSkills.length > 0 ? JSON.stringify(validSkills.map(s => s.skill)) : '[]',
        skills_weightage: validSkills.length > 0 ? JSON.stringify(validSkills) : null,
        location: '',
        job_type: 'Full-time',
        work_mode: 'Remote',
        department: company,
        number_of_openings: 1,
        interview_type: 'AI',
        number_of_questions: 10,
        resume_parsing_enabled: true,
        question_generation_ready: true,
        expert_review_status: 'pending',
      }

      // If file uploaded, use FormData
      let response
      if (file) {
        const formData = new FormData()
        Object.entries(jobPayload).forEach(([key, val]) => {
          if (val !== null && val !== undefined) formData.append(key, String(val))
        })
        formData.append('description_file', file)
        response = await apiClient.post('/api/createJob', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        response = await apiClient.post('/api/createJob', jobPayload)
      }

      const createdJob = response.data
      const newJob: Job = {
        id: createdJob.id,
        title: createdJob.title,
        company: createdJob.company,
        salary: createdJob.salary_range || 'Competitive',
        postedTime: 'Just now',
        type: createdJob.job_type || 'Full-time',
        location: createdJob.location || '',
        status: createdJob.status as 'Open' | 'Interview In Progress' | 'Closed' | 'Paused',
        appliedCount: 0,
        interviewPending: 0,
        selected: 0,
        rejected: 0,
        experienceLevel: createdJob.experience_level || '',
        numberOfQuestions: createdJob.number_of_questions || 10,
        interviewType: createdJob.interview_type || 'AI',
        resumeParsingEnabled: createdJob.resume_parsing_enabled ?? true,
        questionGenerationReady: createdJob.question_generation_ready ?? true,
        expertReviewStatus: createdJob.expert_review_status || 'pending',
        description: createdJob.description,
        icon: 'fas fa-briefcase',
        color: '#6366f1',
      }

      if (onJobCreate) onJobCreate(newJob)
      dismissToast(loadingToast)
      showSuccess(`Job "${createdJob.title}" created successfully!`)
      onClose()
    } catch (error: any) {
      dismissToast(loadingToast)
      showError(error.response?.data?.detail || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '8px',
      backgroundColor: 'white',
      '& fieldset': { borderColor: '#e2e8f0' },
      '&:hover fieldset': { borderColor: '#020291' },
      '&.Mui-focused fieldset': { borderColor: '#020291', boxShadow: '0 0 0 3px rgba(2,2,145,0.08)' },
    },
    '& .MuiOutlinedInput-input': { padding: '12px 16px', fontSize: '14px' },
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', py: { xs: 3, md: 5 }, px: { xs: 2, md: 0 } }}>
      {/* Back */}
      <Button
        onClick={onClose}
        sx={{
          textTransform: 'none', fontWeight: 500, fontSize: '13px', color: '#64748b', mb: 2,
          '&:hover': { color: '#020291', background: 'transparent' },
        }}
      >
        <i className="fas fa-arrow-left" style={{ marginRight: 8, fontSize: 12 }}></i> Back
      </Button>

      <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#111827', mb: '4px' }}>
        New Position
      </Typography>
      <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>
        Create a new job position to start interviewing
      </Typography>

      {/* Form Card */}
      <Box sx={{
        p: { xs: '20px', md: '28px' },
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Title + Company row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: '16px' }}>
          <Box>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
              Job Title <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <TextField
              fullWidth placeholder="e.g. Senior Frontend Engineer"
              value={title}
              onChange={e => handleFieldChange('title', e.target.value, setTitle)}
              onBlur={() => handleBlur('title', title)}
              error={touched.title && !!errors.title}
              helperText={touched.title && errors.title}
              sx={inputSx}
            />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
              Company <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <TextField
              fullWidth placeholder="e.g. Fusion Global Solutions"
              value={company}
              onChange={e => handleFieldChange('company', e.target.value, setCompany)}
              onBlur={() => handleBlur('company', company)}
              error={touched.company && !!errors.company}
              helperText={touched.company && errors.company}
              sx={inputSx}
            />
          </Box>
        </Box>

        {/* Experience */}
        <Box>
          <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
            Required Experience (years)
          </Typography>
          <TextField
            fullWidth type="number"
            value={yearsExperience}
            onChange={e => handleFieldChange('yearsExperience', e.target.value, setYearsExperience)}
            slotProps={{ htmlInput: { min: 0, max: 50 } }}
            sx={inputSx}
          />
        </Box>

        {/* Job Description */}
        <Box>
          <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
            Job Description
          </Typography>
          <TextField
            fullWidth multiline rows={4}
            placeholder="Describe the role, responsibilities, skills required..."
            value={description}
            onChange={e => handleFieldChange('description', e.target.value, setDescription)}
            onBlur={() => handleBlur('description', description)}
            error={touched.description && !!errors.description}
            helperText={touched.description && errors.description}
            sx={{
              ...inputSx,
              '& .MuiOutlinedInput-input': { padding: '12px 16px', fontSize: '14px', lineHeight: 1.6 },
            }}
          />
        </Box>

        {/* Skills Weightage */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
              Skill Weightage (optional)
            </Typography>
            <Button
              onClick={() => setSkills(prev => [...prev, { skill: '', weightage: 0 }])}
              sx={{
                textTransform: 'none', fontSize: '13px', fontWeight: 600, color: '#020291',
                minWidth: 'auto', p: '4px 8px',
                '&:hover': { background: 'rgba(2,2,145,0.06)' },
              }}
            >
              + Add skill
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {skills.map((row, idx) => (
              <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 36px', gap: '8px', alignItems: 'center' }}>
                <TextField
                  size="small" placeholder="Skill name"
                  value={row.skill}
                  onChange={e => {
                    const next = [...skills]; next[idx].skill = e.target.value; setSkills(next)
                  }}
                  sx={inputSx}
                />
                <TextField
                  size="small" type="number" placeholder="%"
                  value={row.weightage}
                  onChange={e => {
                    const next = [...skills]; next[idx].weightage = Number(e.target.value); setSkills(next)
                  }}
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  sx={inputSx}
                />
                <IconButton
                  size="small"
                  onClick={() => setSkills(prev => prev.filter((_, i) => i !== idx))}
                  sx={{ color: '#94a3b8', '&:hover': { color: '#ef4444' } }}
                >
                  <i className="fas fa-trash-alt" style={{ fontSize: 14 }}></i>
                </IconButton>
              </Box>
            ))}
            {skills.length > 0 && (
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                Total: {skills.filter(s => s.skill.trim() && s.weightage > 0).reduce((a, c) => a + c.weightage, 0)}%
              </Typography>
            )}
          </Box>
        </Box>

        {/* Upload JD */}
        <Box>
          <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
            Or upload a JD file
          </Typography>
          {file ? (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: '10px',
              p: '12px 16px', borderRadius: '8px',
              background: '#EEF0FF', border: '1px solid #BBC3FF',
            }}>
              <i className="fas fa-file-alt" style={{ color: '#020291', fontSize: 14 }}></i>
              <Typography sx={{ fontSize: '13px', color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </Typography>
              <IconButton size="small" onClick={() => setFile(null)} sx={{ color: '#64748b' }}>
                <i className="fas fa-times" style={{ fontSize: 12 }}></i>
              </IconButton>
            </Box>
          ) : (
            <Box
              onClick={() => fileInputRef.current?.click()}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '6px', p: '28px 16px', borderRadius: '8px',
                border: '2px dashed #d1d5db', cursor: 'pointer',
                '&:hover': { borderColor: '#020291', background: 'rgba(2,2,145,0.02)' },
              }}
            >
              <i className="fas fa-cloud-upload-alt" style={{ fontSize: 20, color: '#94a3b8' }}></i>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Click to upload</Typography>
              <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>.pdf, .docx, .txt</Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.doc"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Buttons */}
      <Box sx={{ display: 'flex', gap: '10px', mt: 3 }}>
        <Button
          onClick={onClose}
          sx={{
            textTransform: 'none', fontWeight: 600, fontSize: '14px',
            color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px',
            padding: '10px 24px', background: '#fff',
            '&:hover': { borderColor: '#020291', background: '#f8fafc' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={loading}
          sx={{
            textTransform: 'none', fontWeight: 600, fontSize: '14px',
            color: '#fff', backgroundColor: '#020291', borderRadius: '8px',
            padding: '10px 24px',
            '&:hover': { backgroundColor: '#06109E' },
            '&:disabled': { backgroundColor: '#94a3b8', color: '#fff' },
          }}
        >
          {loading ? 'Creating...' : 'Create position'}
          {!loading && <i className="fas fa-arrow-right" style={{ marginLeft: 8, fontSize: 12 }}></i>}
        </Button>
      </Box>
    </Box>
  )
}

export default JobCreationForm
