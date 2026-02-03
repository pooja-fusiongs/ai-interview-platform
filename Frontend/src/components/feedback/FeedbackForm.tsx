import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Slider, Switch, FormControlLabel,
  Select, MenuItem, FormControl, InputLabel, Paper, Alert, Grid
} from '@mui/material';
import Sidebar from '../layout/sidebar';
import feedbackService from '../../services/feedbackService';

const FeedbackForm: React.FC = () => {
  const [candidateId, setCandidateId] = useState<number>(0);
  const [jobId, setJobId] = useState<number>(0);
  const [hireDate, setHireDate] = useState('');
  const [jobPerformance, setJobPerformance] = useState(5);
  const [culturalFit, setCulturalFit] = useState(5);
  const [technicalSkills, setTechnicalSkills] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [leadership, setLeadership] = useState(5);
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [comments, setComments] = useState('');
  const [stillEmployed, setStillEmployed] = useState(true);
  const [leftReason, setLeftReason] = useState('');
  const [wouldRehire, setWouldRehire] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    try {
      await feedbackService.submitFeedback({
        candidate_id: candidateId,
        job_id: jobId,
        hire_date: hireDate,
        job_performance: jobPerformance,
        cultural_fit: culturalFit,
        technical_skills: technicalSkills,
        communication,
        leadership,
        strengths,
        areas_for_improvement: areasForImprovement,
        comments,
        still_employed: stillEmployed,
        left_reason: stillEmployed ? null : leftReason,
        would_rehire: wouldRehire,
      });
      setSuccess('Feedback submitted successfully');
    } catch {
      setError('Failed to submit feedback');
    }
  };

  const sliderProps = (label: string, value: number, setter: (v: number) => void) => (
    <Box sx={{ mb: 2 }}>
      <Typography gutterBottom>{label}: {value}</Typography>
      <Slider value={value} onChange={(_, v) => setter(v as number)} min={1} max={10} marks step={1} valueLabelDisplay="auto" />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', bgcolor: '#f5f5f5' }}>
        <Typography variant="h4" sx={{ mb: 3 }}>Submit Hire Feedback</Typography>
        {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={4}>
              <TextField label="Candidate ID" type="number" fullWidth value={candidateId} onChange={e => setCandidateId(Number(e.target.value))} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Job ID" type="number" fullWidth value={jobId} onChange={e => setJobId(Number(e.target.value))} />
            </Grid>
            <Grid item xs={4}>
              <TextField label="Hire Date" type="date" fullWidth InputLabelProps={{ shrink: true }} value={hireDate} onChange={e => setHireDate(e.target.value)} />
            </Grid>
          </Grid>
          <Typography variant="h6" sx={{ mb: 2 }}>Performance Scores</Typography>
          {sliderProps('Job Performance', jobPerformance, setJobPerformance)}
          {sliderProps('Cultural Fit', culturalFit, setCulturalFit)}
          {sliderProps('Technical Skills', technicalSkills, setTechnicalSkills)}
          {sliderProps('Communication', communication, setCommunication)}
          {sliderProps('Leadership', leadership, setLeadership)}
          <Typography variant="h6" sx={{ mb: 2, mt: 3 }}>Qualitative Feedback</Typography>
          <TextField label="Strengths" multiline rows={3} fullWidth sx={{ mb: 2 }} value={strengths} onChange={e => setStrengths(e.target.value)} />
          <TextField label="Areas for Improvement" multiline rows={3} fullWidth sx={{ mb: 2 }} value={areasForImprovement} onChange={e => setAreasForImprovement(e.target.value)} />
          <TextField label="Additional Comments" multiline rows={3} fullWidth sx={{ mb: 3 }} value={comments} onChange={e => setComments(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 2 }}>
            <FormControlLabel control={<Switch checked={stillEmployed} onChange={e => setStillEmployed(e.target.checked)} />} label="Still Employed" />
            {!stillEmployed && (
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Reason for Leaving</InputLabel>
                <Select value={leftReason} label="Reason for Leaving" onChange={e => setLeftReason(e.target.value)}>
                  <MenuItem value="resigned">Resigned</MenuItem>
                  <MenuItem value="terminated">Terminated</MenuItem>
                  <MenuItem value="contract_ended">Contract Ended</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            )}
            <FormControlLabel control={<Switch checked={wouldRehire} onChange={e => setWouldRehire(e.target.checked)} />} label="Would Rehire" />
          </Box>
          <Button variant="contained" size="large" onClick={handleSubmit}>Submit Feedback</Button>
        </Paper>
      </Box>
    </Box>
  );
};

export default FeedbackForm;
