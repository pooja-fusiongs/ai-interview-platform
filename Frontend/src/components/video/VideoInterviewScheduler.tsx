
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Autocomplete,
  Snackbar,
  Alert,
  Fade,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import dayjs, { Dayjs } from 'dayjs';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { jobService } from '../../services/jobService';
import { candidateService } from '../../services/candidateService';

// Normalized interface for jobs (internal use)
interface Job {
  id: number;
  title: string;
  company?: string;
  status?: string;
}

// Normalized interface for candidates (internal use)
interface Candidate {
  id: number;
  name: string;
  email: string;
  jobTitle?: string;
}

// Helper to normalize job data from various API response formats
const normalizeJob = (job: any): Job => ({
  id: job.id,
  title: job.title || job.job_title || job.jobTitle || 'Untitled Job',
  company: job.company || job.company_name || job.companyName || '',
  status: job.status || job.is_active ? 'active' : 'inactive',
});

// Helper to normalize candidate data from various API response formats
const normalizeCandidate = (candidate: any): Candidate => ({
  id: candidate.id,
  name: candidate.name || candidate.candidate_name || candidate.candidateName || candidate.full_name || candidate.fullName || 'Unknown',
  email: candidate.email || candidate.candidate_email || '',
  jobTitle: candidate.jobTitle || candidate.job_title || candidate.position || '',
});

const DURATION_OPTIONS = [
  { value: 30, label: '30 min', description: 'Quick screening' },
  { value: 45, label: '45 min', description: 'Recommended', recommended: true },
  { value: 60, label: '60 min', description: 'Technical deep-dive' },
];

const VideoInterviewScheduler: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [selectedTime, setSelectedTime] = useState<Dayjs | null>(dayjs().hour(0).minute(0));
  const [duration, setDuration] = useState(45);

  // Data state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({
    job: false,
    candidate: false,
    scheduledAt: false,
  });

  // Get user timezone
  const userTimezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  const timezoneOffset = useMemo(() => {
    const offset = new Date().getTimezoneOffset();
    const hours = Math.abs(Math.floor(offset / 60));
    const minutes = Math.abs(offset % 60);
    const sign = offset <= 0 ? '+' : '-';
    return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, []);

  // Get minimum date (today)
  const minDate = useMemo(() => dayjs(), []);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
    // Also load all candidates as fallback
    loadAllCandidates();
  }, []);

  // Load candidates when job is selected
  useEffect(() => {
    if (selectedJob) {
      loadCandidatesByJob(selectedJob.id);
    }
  }, [selectedJob]);

  const loadJobs = async () => {
    setLoadingJobs(true);
    try {
      // Try without status filter first
      const response = await jobService.getJobs({ limit: 100 });
      console.log('Jobs API raw response:', response);

      // Handle various API response structures
      let rawJobs: any[] = [];
      if (Array.isArray(response)) {
        rawJobs = response;
      } else if (response?.jobs && Array.isArray(response.jobs)) {
        rawJobs = response.jobs;
      } else if (response?.data && Array.isArray(response.data)) {
        rawJobs = response.data;
      } else if (response?.data?.jobs && Array.isArray(response.data.jobs)) {
        rawJobs = response.data.jobs;
      }

      // Normalize each job to ensure consistent field names
      const normalizedJobs = rawJobs.map(normalizeJob).filter(job => job.id);
      console.log('Normalized jobs:', normalizedJobs);
      setJobs(normalizedJobs);

      if (normalizedJobs.length === 0) {
        console.warn('No jobs found in API response');
      }
    } catch (err: any) {
      console.error('Failed to load jobs:', err?.response?.data || err?.message || err);
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Store all candidates for fallback
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);

  const loadAllCandidates = async () => {
    try {
      const response = await candidateService.getCandidates({ limit: 100 });
      console.log('All candidates API raw response:', response);

      let rawCandidates: any[] = [];
      if (Array.isArray(response)) {
        rawCandidates = response;
      } else if (response?.candidates && Array.isArray(response.candidates)) {
        rawCandidates = response.candidates;
      } else if (response?.data && Array.isArray(response.data)) {
        rawCandidates = response.data;
      } else if (response?.data?.candidates && Array.isArray(response.data.candidates)) {
        rawCandidates = response.data.candidates;
      }

      const normalizedCandidates = rawCandidates.map(normalizeCandidate).filter(c => c.id);
      console.log('All normalized candidates:', normalizedCandidates);
      setAllCandidates(normalizedCandidates);
    } catch (err: any) {
      console.error('Failed to load all candidates:', err?.response?.data || err?.message || err);
    }
  };

  const loadCandidatesByJob = async (jobId: number) => {
    setLoadingCandidates(true);
    try {
      const response = await candidateService.getCandidatesByJob(jobId, { limit: 100 });
      console.log('Candidates by job API raw response:', response);

      let rawCandidates: any[] = [];
      if (Array.isArray(response)) {
        rawCandidates = response;
      } else if (response?.candidates && Array.isArray(response.candidates)) {
        rawCandidates = response.candidates;
      } else if (response?.data && Array.isArray(response.data)) {
        rawCandidates = response.data;
      } else if (response?.data?.candidates && Array.isArray(response.data.candidates)) {
        rawCandidates = response.data.candidates;
      }

      const normalizedCandidates = rawCandidates.map(normalizeCandidate).filter(c => c.id);
      console.log('Normalized candidates for job:', normalizedCandidates);

      // If no candidates found for this job, use all candidates as fallback
      if (normalizedCandidates.length === 0 && allCandidates.length > 0) {
        console.log('Using all candidates as fallback');
        setCandidates(allCandidates);
      } else {
        setCandidates(normalizedCandidates);
      }
    } catch (err: any) {
      console.error('Failed to load candidates by job:', err?.response?.data || err?.message || err);
      // Use all candidates as fallback on error
      if (allCandidates.length > 0) {
        console.log('Using all candidates as fallback due to error');
        setCandidates(allCandidates);
      } else {
        setCandidates([]);
      }
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Validation
  const validation = useMemo(() => {
    let isDateTimeValid = false;
    if (selectedDate && selectedTime) {
      const combined = selectedDate
        .hour(selectedTime.hour())
        .minute(selectedTime.minute())
        .second(0);
      isDateTimeValid = combined.isAfter(dayjs());
    }
    return {
      job: !!selectedJob,
      candidate: !!selectedCandidate,
      scheduledAt: isDateTimeValid,
    };
  }, [selectedJob, selectedCandidate, selectedDate, selectedTime]);

  const isFormValid = validation.job && validation.candidate && validation.scheduledAt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setTouched({ job: true, candidate: true, scheduledAt: true });
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      // Combine date and time for API
      const scheduledDateTime = selectedDate!
        .hour(selectedTime!.hour())
        .minute(selectedTime!.minute())
        .second(0)
        .toISOString();

      const result = await videoInterviewService.scheduleInterview({
        job_id: selectedJob!.id,
        candidate_id: selectedCandidate!.id,
        scheduled_at: scheduledDateTime,
        duration_minutes: duration,
      });
      setSuccess(result);
      // Redirect to video interviews list on success
      setTimeout(() => {
        navigate('/video-interviews');
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to schedule interview. Please try again.';
      setError(errorMsg);

      // Check if error is about questions not approved
      const lowerMsg = errorMsg.toLowerCase();
      if (lowerMsg.includes('approve') || lowerMsg.includes('question')) {
        // Redirect to manage candidates page after showing error
        setTimeout(() => {
          navigate(`/recruiter-candidates?jobId=${selectedJob!.id}&jobTitle=${encodeURIComponent(selectedJob!.title)}`);
        }, 2500);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSuccess(null);
    setError('');
  };

  // Styles
  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      backgroundColor: '#fff',
      transition: 'all 0.15s ease',
      '&:hover': {
        backgroundColor: '#fafafa',
      },
      '&.Mui-focused': {
        backgroundColor: '#fff',
        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.15)',
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: '#f59e0b',
          borderWidth: '1.5px',
        },
      },
      '&.Mui-error .MuiOutlinedInput-notchedOutline': {
        borderColor: '#ef4444',
      },
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: '#f59e0b',
    },
  };

  const ValidationIcon = ({ isValid, show }: { isValid: boolean; show: boolean }) => {
    if (!show) return null;
    return (
      <Fade in>
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isValid ? '#dcfce7' : '#fef2f2',
            transition: 'all 0.15s ease',
          }}
        >
          <i
            className={isValid ? 'fas fa-check' : 'fas fa-times'}
            style={{
              fontSize: '10px',
              color: isValid ? '#16a34a' : '#ef4444',
            }}
          />
        </Box>
      </Fade>
    );
  };

  return (
    <Navigation>
      <Box
        sx={{
          minHeight: '100vh',
          background: '#F8F9FB',
          padding: { xs: '16px 12px', sm: '24px 20px', md: '32px 24px' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Page Header */}
        <Box sx={{ width: '100%', maxWidth: 520, mb: { xs: '20px', md: '28px' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', md: '14px' }, mb: '6px' }}>
            <Box
              sx={{
                width: { xs: 38, md: 44 },
                height: { xs: 38, md: 44 },
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                flexShrink: 0,
              }}
            >
              <i className="fas fa-video" style={{ color: '#fff', fontSize: '16px' }} />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontSize: { xs: '18px', sm: '20px', md: '22px' },
                  fontWeight: 700,
                  color: '#1e293b',
                  letterSpacing: '-0.02em',
                }}
              >
                Schedule Interview
              </Typography>
              <Typography sx={{ fontSize: { xs: '12px', md: '14px' }, color: '#64748b' }}>
                Set up a video interview with your candidate
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Main Card */}
        <Card
          sx={{
            width: '100%',
            maxWidth: 520,
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
            overflow: 'visible',
          }}
        >
          <CardContent sx={{ padding: { xs: '16px 16px 20px', sm: '20px 22px 26px', md: '28px 28px 32px' } }}>
            <form onSubmit={handleSubmit}>
              {/* Job Selection */}
              <Box sx={{ mb: '22px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fas fa-briefcase" style={{ fontSize: '11px', color: '#6b7280' }} />
                    Job Position
                  </Typography>
                  <ValidationIcon isValid={validation.job} show={touched.job} />
                </Box>
                <Autocomplete
                  options={jobs}
                  value={selectedJob}
                  onChange={(_, value) => {
                    setSelectedJob(value);
                    setTouched((prev) => ({ ...prev, job: true }));
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, job: true }))}
                  getOptionLabel={(option) => {
                    if (!option) return '';
                    const title = option.title || 'Untitled';
                    const company = option.company;
                    return company ? `${title} - ${company}` : title;
                  }}
                  loading={loadingJobs}
                  isOptionEqualToValue={(option, value) => option?.id === value?.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Search and select a job..."
                      error={touched.job && !validation.job}
                      helperText={touched.job && !validation.job ? 'Please select a job position' : ''}
                      sx={inputStyles}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <InputAdornment position="start">
                              <i className="fas fa-search" style={{ color: '#9ca3af', fontSize: '13px' }} />
                            </InputAdornment>
                            {params.InputProps.startAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} key={option.id} sx={{ padding: '10px 14px !important' }}>
                      <Box>
                        <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>
                          {option.title || 'Untitled Job'}
                        </Typography>
                        {option.company && (
                          <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                            {option.company}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                />
              </Box>

              {/* Candidate Selection */}
              <Box sx={{ mb: '22px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fas fa-user" style={{ fontSize: '11px', color: '#6b7280' }} />
                    Candidate
                  </Typography>
                  <ValidationIcon isValid={validation.candidate} show={touched.candidate} />
                </Box>
                <Autocomplete
                  options={candidates}
                  value={selectedCandidate}
                  onChange={(_, value) => {
                    setSelectedCandidate(value);
                    setTouched((prev) => ({ ...prev, candidate: true }));
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, candidate: true }))}
                  getOptionLabel={(option) => {
                    if (!option) return '';
                    const name = option.name || 'Unknown';
                    const email = option.email;
                    return email ? `${name} (${email})` : name;
                  }}
                  loading={loadingCandidates}
                  disabled={!selectedJob || loadingCandidates}
                  isOptionEqualToValue={(option, value) => option?.id === value?.id}
                  noOptionsText={selectedJob ? 'No candidates found for this job' : 'Select a job first'}
                  filterOptions={(options, { inputValue }) => {
                    const filterValue = inputValue.toLowerCase();
                    return options.filter(
                      (option) =>
                        option.name?.toLowerCase().includes(filterValue) ||
                        option.email?.toLowerCase().includes(filterValue)
                    );
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={selectedJob ? 'Search and select a candidate...' : 'Select a job first'}
                      error={touched.candidate && !validation.candidate}
                      helperText={touched.candidate && !validation.candidate ? 'Please select a candidate' : ''}
                      sx={inputStyles}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <InputAdornment position="start">
                              <i className="fas fa-search" style={{ color: '#9ca3af', fontSize: '13px' }} />
                            </InputAdornment>
                            {params.InputProps.startAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} key={option.id} sx={{ padding: '10px 14px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          {(option.name || 'U').charAt(0).toUpperCase()}
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>
                            {option.name || 'Unknown Candidate'}
                          </Typography>
                          <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                            {option.email || 'No email'}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}
                />
              </Box>

              {/* Date & Time */}
              <Box sx={{ mb: '22px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '8px' }}>
                  <Typography
                    sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fas fa-calendar-alt" style={{ fontSize: '11px', color: '#6b7280' }} />
                    Date & Time
                  </Typography>
                  <ValidationIcon isValid={validation.scheduledAt} show={touched.scheduledAt} />
                </Box>

                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <Box sx={{ display: 'flex', gap: '12px', width: '100%' }}>
                    {/* Date Picker - Opens Modal */}
                    <MobileDatePicker
                      value={selectedDate}
                      onChange={(newValue) => {
                        setSelectedDate(newValue);
                        setTouched((prev) => ({ ...prev, scheduledAt: true }));
                      }}
                      minDate={minDate}
                      format="DD-MM-YYYY"
                      sx={{ flex: 1, minWidth: 0 }}
                      slotProps={{
                        textField: {
                          size: 'medium',
                          placeholder: 'Select date',
                          error: touched.scheduledAt && !selectedDate,
                          sx: { ...inputStyles, width: '100%' },
                          InputProps: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <i className="fas fa-calendar" style={{ color: '#9ca3af', fontSize: '14px' }} />
                              </InputAdornment>
                            ),
                          },
                        },
                        dialog: {
                          sx: {
                            '& .MuiPickersCalendarHeader-root': {
                              backgroundColor: '#f59e0b',
                              color: '#fff',
                            },
                            '& .MuiPickersDay-root.Mui-selected': {
                              backgroundColor: '#f59e0b',
                            },
                            '& .MuiButton-root': {
                              color: '#f59e0b',
                            },
                          },
                        },
                      }}
                    />

                    {/* Time Picker - Opens Modal */}
                    <MobileTimePicker
                      value={selectedTime}
                      onChange={(newValue) => {
                        setSelectedTime(newValue);
                        setTouched((prev) => ({ ...prev, scheduledAt: true }));
                      }}
                      format="HH:mm"
                      ampm={false}
                      sx={{ flex: 1, minWidth: 0 }}
                      slotProps={{
                        textField: {
                          size: 'medium',
                          placeholder: 'Select time',
                          error: touched.scheduledAt && !selectedTime,
                          sx: { ...inputStyles, width: '100%' },
                          InputProps: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <i className="fas fa-clock" style={{ color: '#9ca3af', fontSize: '14px' }} />
                              </InputAdornment>
                            ),
                          },
                        },
                        dialog: {
                          sx: {
                            '& .MuiPickersToolbar-root': {
                              backgroundColor: '#f59e0b',
                              color: '#fff',
                            },
                            '& .MuiClock-pin, & .MuiClockPointer-root, & .MuiClockPointer-thumb': {
                              backgroundColor: '#f59e0b',
                            },
                            '& .MuiButton-root': {
                              color: '#f59e0b',
                            },
                          },
                        },
                      }}
                    />
                  </Box>
                </LocalizationProvider>

                {touched.scheduledAt && !validation.scheduledAt && (
                  <Typography sx={{ fontSize: '12px', color: '#ef4444', mt: '6px', ml: '14px' }}>
                    Please select a future date and time
                  </Typography>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '8px' }}>
                  <i className="fas fa-globe" style={{ fontSize: '11px', color: '#9ca3af' }} />
                  <Typography sx={{ fontSize: '12px', color: '#6b7280' }}>
                    {userTimezone} ({timezoneOffset})
                  </Typography>
                </Box>
              </Box>

              {/* Duration Pills */}
              <Box sx={{ mb: '28px' }}>
                <Typography
                  sx={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    mb: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fas fa-hourglass-half" style={{ fontSize: '11px', color: '#6b7280' }} />
                  Duration
                </Typography>
                <Box sx={{ display: 'flex', gap: '10px' }}>
                  {DURATION_OPTIONS.map((option) => (
                    <Tooltip
                      key={option.value}
                      title={option.description}
                      arrow
                      placement="top"
                    >
                      <Box
                        onClick={() => setDuration(option.value)}
                        sx={{
                          flex: 1,
                          padding: '14px 12px',
                          borderRadius: '10px',
                          border: `1.5px solid ${duration === option.value ? '#f59e0b' : '#e5e7eb'}`,
                          backgroundColor: duration === option.value ? 'rgba(245, 158, 11, 0.08)' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'center',
                          position: 'relative',
                          '&:hover': {
                            borderColor: duration === option.value ? '#f59e0b' : '#d1d5db',
                            backgroundColor: duration === option.value ? 'rgba(245, 158, 11, 0.08)' : '#fafafa',
                          },
                        }}
                      >
                        {option.recommended && (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: '-8px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              backgroundColor: '#f59e0b',
                              color: '#fff',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            Best
                          </Box>
                        )}
                        <Typography
                          sx={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: duration === option.value ? '#f59e0b' : '#374151',
                          }}
                        >
                          {option.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '11px',
                            color: '#6b7280',
                            mt: '2px',
                          }}
                        >
                          {option.description}
                        </Typography>
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </Box>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || !isFormValid}
                fullWidth
                sx={{
                  padding: '14px 24px',
                  borderRadius: '10px',
                  background: isFormValid
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : '#e5e7eb',
                  boxShadow: isFormValid ? '0 4px 14px rgba(245, 158, 11, 0.35)' : 'none',
                  fontSize: '15px',
                  fontWeight: 600,
                  textTransform: 'none',
                  color: isFormValid ? '#fff' : '#9ca3af',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: isFormValid
                      ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                      : '#e5e7eb',
                    boxShadow: isFormValid ? '0 6px 20px rgba(245, 158, 11, 0.4)' : 'none',
                    transform: isFormValid ? 'translateY(-1px)' : 'none',
                  },
                  '&:active': {
                    transform: 'translateY(0)',
                  },
                  '&.Mui-disabled': {
                    background: '#e5e7eb',
                    color: '#9ca3af',
                  },
                }}
              >
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CircularProgress size={18} sx={{ color: '#fff' }} />
                    <span>Scheduling...</span>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-calendar-check" style={{ fontSize: '15px' }} />
                    <span>Schedule Interview</span>
                  </Box>
                )}
              </Button>

              {/* Helper Text */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  mt: '16px',
                }}
              >
                <i className="fas fa-envelope" style={{ fontSize: '11px', color: '#9ca3af' }} />
                <Typography sx={{ fontSize: '12px', color: '#6b7280' }}>
                  Calendar invite will be sent to both parties
                </Typography>
              </Box>
            </form>
          </CardContent>
        </Card>

        {/* Success Snackbar */}
        <Snackbar
          open={!!success}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity="success"
            variant="filled"
            sx={{
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              '& .MuiAlert-icon': {
                fontSize: '20px',
              },
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '14px' }}>
                Interview scheduled successfully!
              </Typography>
              <Typography sx={{ fontSize: '13px', opacity: 0.9 }}>
                Email confirmation sent to candidate.
              </Typography>
            </Box>
          </Alert>
        </Snackbar>

        {/* Error Snackbar */}
        <Snackbar
          open={!!error}
          autoHideDuration={10000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={error.toLowerCase().includes('approve') ? 'warning' : 'error'}
            variant="filled"
            sx={{
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              maxWidth: '500px',
              '& .MuiAlert-message': {
                fontSize: '14px',
                lineHeight: 1.5,
              },
            }}
          >
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </Navigation>
  );
};

export default VideoInterviewScheduler;
