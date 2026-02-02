import { useState, useEffect } from 'react'
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Avatar,
  Paper,
  Stack,
  Container,
  FormControl,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  IconButton
} from '@mui/material'
import { 
  Edit, 
  Person, 
  PhotoCamera,
  Visibility,
  VisibilityOff
} from '@mui/icons-material'
import { toast } from 'react-hot-toast'
import { profileService } from '../../services/profileService'
import { ProfileData } from '../../types'
import Navigation from './sidebar'

const Profile = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<ProfileData | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  })

  // Fetch profile data
  const fetchProfile = async () => {
    try {
      setLoading(true)
      const data = await profileService.getProfile()
      setProfile(data)
      setFormData(data)
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  // Save profile data
  const saveProfile = async () => {
    if (!formData) return
    
    try {
      setSaving(true)
      await profileService.updateProfile(formData)
      setProfile(formData)
      setIsEditing(false)
      toast.success('Profile updated successfully!')
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handleInputChange = (field: string, value: any) => {
    if (!formData) return
    setFormData({ ...formData, [field]: value })
  }

  const handleCancel = () => {
    setFormData(profile)
    setIsEditing(false)
    setPasswords({ current: '', new: '', confirm: '' })
  }

  const handlePasswordChange = (field: string, value: string) => {
    setPasswords(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <Navigation>
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Typography variant="h6" color="text.secondary">
              Loading profile...
            </Typography>
          </Box>
        </Container>
      </Navigation>
    )
  }

  return (
    <Navigation>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper 
          elevation={0} 
          sx={{ 
            borderRadius: 3,
            border: '1px solid #e0e0e0',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <Box sx={{ 
            p: 4, 
            borderBottom: '1px solid #e0e0e0',
            background: '#fafafa'
          }}>
            <Typography variant="h4" sx={{ fontWeight: 600, color: '#333', mb: 1 }}>
              Profile
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your name, password and account settings.
            </Typography>
          </Box>

          {/* Profile Photo Section */}
          <Box sx={{ p: 4, borderBottom: '1px solid #e0e0e0' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Box sx={{ position: 'relative' }}>
                <Avatar 
                  sx={{ 
                    width: 80, 
                    height: 80,
                    bgcolor: '#e0e0e0',
                    color: '#666'
                  }}
                >
                  <Person sx={{ fontSize: 40 }} />
                </Avatar>
                {isEditing && (
                  <IconButton
                    sx={{
                      position: 'absolute',
                      bottom: -5,
                      right: -5,
                      bgcolor: 'white',
                      border: '2px solid #e0e0e0',
                      width: 32,
                      height: 32,
                      '&:hover': { bgcolor: '#f5f5f5' }
                    }}
                  >
                    <PhotoCamera sx={{ fontSize: 16 }} />
                  </IconButton>
                )}
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  Profile photo
                </Typography>
                {isEditing && (
                  <Button 
                    variant="text" 
                    size="small"
                    sx={{ 
                      color: '#1976d2',
                      textTransform: 'none',
                      p: 0,
                      minWidth: 'auto'
                    }}
                  >
                    Upload photo
                  </Button>
                )}
              </Box>
            </Box>
          </Box>

          {/* Form Fields */}
          <Box sx={{ p: 4 }}>
            <Stack spacing={3}>
              {/* Full Name */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333'
                  }}
                >
                  Full Name
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flex: 1 }}>
                  <TextField
                    size="small"
                    placeholder="First"
                    value={formData?.full_name?.split(' ')[0] || ''}
                    onChange={(e) => {
                      const lastName = formData?.full_name?.split(' ')[1] || ''
                      handleInputChange('full_name', `${e.target.value} ${lastName}`.trim())
                    }}
                    disabled={!isEditing}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    placeholder="Last"
                    value={formData?.full_name?.split(' ')[1] || ''}
                    onChange={(e) => {
                      const firstName = formData?.full_name?.split(' ')[0] || ''
                      handleInputChange('full_name', `${firstName} ${e.target.value}`.trim())
                    }}
                    disabled={!isEditing}
                    sx={{ flex: 1 }}
                  />
                </Box>
              </Box>

              {/* Email */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333'
                  }}
                >
                  Email
                </Typography>
                <TextField
                  size="small"
                  value={formData?.email || ''}
                  disabled
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* Password */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333',
                    mt: 1
                  }}
                >
                  Password
                </Typography>
                <Stack spacing={2} sx={{ flex: 1 }}>
                  {isEditing ? (
                    <>
                      <TextField
                        size="small"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter current password"
                        value={passwords.current}
                        onChange={(e) => handlePasswordChange('current', e.target.value)}
                        slotProps={{
                          input: {
                            endAdornment: (
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                                size="small"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            )
                          }
                        }}
                      />
                      <TextField
                        size="small"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={passwords.new}
                        onChange={(e) => handlePasswordChange('new', e.target.value)}
                      />
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      ••••••••••••
                    </Typography>
                  )}
                </Stack>
              </Box>

              {/* Phone */}
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333'
                  }}
                >
                  Phone
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value="mobile"
                      disabled={!isEditing}
                    >
                      <MenuItem value="mobile">Mobile</MenuItem>
                      <MenuItem value="home">Home</MenuItem>
                      <MenuItem value="work">Work</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    placeholder="+91xxxxxxxxxx"
                    value={formData?.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    disabled={!isEditing}
                    sx={{ flex: 1 }}
                  />
                  {isEditing && (
                    <Button 
                      variant="text" 
                      size="small"
                      sx={{ 
                        color: '#1976d2',
                        textTransform: 'none',
                        minWidth: 'auto'
                      }}
                    >
                      Add phone
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Gender */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333',
                    mt: 1
                  }}
                >
                  Gender
                </Typography>
                <FormControl component="fieldset" disabled={!isEditing}>
                  <RadioGroup
                    row
                    value={formData?.gender || 'male'}
                    onChange={(e) => handleInputChange('gender', e.target.value)}
                  >
                    <FormControlLabel 
                      value="male" 
                      control={<Radio size="small" />} 
                      label="Male"
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                    />
                    <FormControlLabel 
                      value="female" 
                      control={<Radio size="small" />} 
                      label="Female"
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                    />
                    <FormControlLabel 
                      value="other" 
                      control={<Radio size="small" />} 
                      label="Other"
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                    />
                  </RadioGroup>
                </FormControl>
              </Box>

              {/* Bio */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    minWidth: 120, 
                    fontWeight: 500,
                    color: '#333',
                    mt: 1
                  }}
                >
                  Bio
                </Typography>
                <TextField
                  multiline
                  rows={3}
                  placeholder="Type your message..."
                  value={formData?.bio || ''}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  disabled={!isEditing}
                  sx={{ flex: 1 }}
                  size="small"
                />
              </Box>
            </Stack>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ 
            p: 4, 
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 2,
            bgcolor: '#fafafa'
          }}>
            {!isEditing ? (
              <Button
                variant="contained"
                startIcon={<Edit />}
                onClick={() => setIsEditing(true)}
                sx={{
                  bgcolor: '#1976d2',
                  textTransform: 'none',
                  borderRadius: 2,
                  px: 3
                }}
              >
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 3,
                    color: '#666',
                    borderColor: '#e0e0e0'
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={saveProfile}
                  disabled={saving}
                  sx={{
                    bgcolor: '#1976d2',
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 3
                  }}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </>
            )}
          </Box>
        </Paper>
      </Container>
    </Navigation>
  )
}

export default Profile