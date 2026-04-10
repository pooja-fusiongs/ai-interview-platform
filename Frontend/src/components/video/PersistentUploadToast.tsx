import React from 'react'
import { Box, Typography, LinearProgress, IconButton } from '@mui/material'
import { Close, CheckCircle, CloudUpload, OpenInNew } from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUpload } from '../../contexts/UploadContext'

const PersistentUploadToast: React.FC = () => {
  const { state, cancelUpload, reset } = useUpload()
  const navigate = useNavigate()
  const location = useLocation()

  // Don't show on the test-upload page itself (it has its own UI)
  const isOnUploadPage = location.pathname === '/test-upload'

  // Don't show if idle or on upload page
  if (state.status === 'idle' || isOnUploadPage) return null

  const isUploading = state.status === 'uploading'
  const isProcessing = state.status === 'processing'
  const isCompleted = state.status === 'completed'
  const isError = state.status === 'error'

  const handleClick = () => {
    navigate('/test-upload')
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCompleted || isError) reset()
    else cancelUpload()
  }

  return (
    <Box
      onClick={handleClick}
      sx={{
        position: 'fixed',
        top: 80,
        right: 24,
        zIndex: 1400,
        width: 340,
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 12px 40px rgba(0,0,0,0.16)' },
      }}
    >
      {/* Progress bar at top */}
      {(isUploading || isProcessing) && (
        <LinearProgress
          variant={isUploading && state.progress > 0 ? 'determinate' : 'indeterminate'}
          value={isUploading ? state.progress : undefined}
          sx={{
            height: 3,
            backgroundColor: '#EEF0FF',
            '& .MuiLinearProgress-bar': { backgroundColor: '#020291' },
          }}
        />
      )}
      {isCompleted && (
        <Box sx={{ height: 3, background: '#10b981' }} />
      )}
      {isError && (
        <Box sx={{ height: 3, background: '#ef4444' }} />
      )}

      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* Icon */}
        <Box sx={{
          width: 36, height: 36, borderRadius: '8px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isCompleted ? '#ecfdf5' : isError ? '#fef2f2' : '#EEF0FF',
        }}>
          {isCompleted ? (
            <CheckCircle sx={{ fontSize: 20, color: '#10b981' }} />
          ) : (
            <CloudUpload sx={{ fontSize: 20, color: isError ? '#ef4444' : '#020291' }} />
          )}
        </Box>

        {/* Text */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>
            {isUploading ? `Uploading${state.progress > 0 ? ` ${state.progress}%` : '...'}`
              : isProcessing ? 'Processing interview'
              : isCompleted ? 'Interview created!'
              : 'Upload failed'}
          </Typography>
          <Typography sx={{ fontSize: '11px', color: '#64748b', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isUploading ? (state.fileName || 'Uploading video...')
              : isProcessing ? state.processingStep
              : isCompleted && state.result?.scoring_done ? `Score: ${(state.result.overall_score / 10).toFixed(1)}/10 - Click to view`
              : isCompleted ? 'Click to view results'
              : state.error || 'Something went wrong'}
          </Typography>
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          {(isCompleted || isProcessing) && (
            <OpenInNew sx={{ fontSize: 16, color: '#94a3b8' }} />
          )}
          <IconButton size="small" onClick={handleDismiss} sx={{ color: '#94a3b8', '&:hover': { color: '#64748b' } }}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}

export default PersistentUploadToast
