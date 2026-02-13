import  { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Paper,
  Chip,
  Stack,
} from '@mui/material';
import {
  ArrowForward as ArrowForwardIcon,
  CheckCircle as CheckCircleIcon,
  Description as DescriptionIcon,
  People as PeopleIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';

/* ─── Hero SVG Illustration ─── */
function HeroIllustration() {
  return (
    <svg viewBox="0 0 500 400" width="100%" height="auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .float-slow { animation: float 5s ease-in-out infinite; }
        .float-fast { animation: float 4.5s ease-in-out infinite; animation-delay: 1s; }
      `}</style>
      <circle cx="250" cy="200" r="160" fill="#f0f1ff" opacity="0.5" />
      <circle cx="250" cy="200" r="120" fill="#e0e2ff" opacity="0.4" />

      {/* Main card */}
      <rect x="120" y="80" width="260" height="180" rx="16" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="140" y="100" width="80" height="8" rx="4" fill="#020291" opacity="0.2" />
      <rect x="140" y="116" width="140" height="6" rx="3" fill="#e5e7eb" />
      <rect x="140" y="130" width="120" height="6" rx="3" fill="#e5e7eb" />

      {/* Profile row 1 */}
      <circle cx="155" cy="160" r="12" fill="#020291" opacity="0.15" />
      <rect x="175" y="155" width="80" height="5" rx="2.5" fill="#d1d5db" />
      <rect x="175" y="165" width="50" height="4" rx="2" fill="#e5e7eb" />
      <rect x="330" y="155" width="30" height="14" rx="7" fill="#020291" />
      <text x="345" y="165" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">8.5</text>

      {/* Profile row 2 */}
      <circle cx="155" cy="195" r="12" fill="#10b981" opacity="0.15" />
      <rect x="175" y="190" width="70" height="5" rx="2.5" fill="#d1d5db" />
      <rect x="175" y="200" width="60" height="4" rx="2" fill="#e5e7eb" />
      <rect x="330" y="190" width="30" height="14" rx="7" fill="#10b981" />
      <text x="345" y="200" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">7.2</text>

      {/* Profile row 3 */}
      <circle cx="155" cy="230" r="12" fill="#f59e0b" opacity="0.15" />
      <rect x="175" y="225" width="90" height="5" rx="2.5" fill="#d1d5db" />
      <rect x="175" y="235" width="55" height="4" rx="2" fill="#e5e7eb" />
      <rect x="330" y="225" width="30" height="14" rx="7" fill="#f59e0b" />
      <text x="345" y="235" textAnchor="middle" fill="white" fontSize="8" fontWeight="600">6.8</text>

      {/* Floating mini chart */}
      <g className="float-slow">
        <rect x="320" y="60" width="100" height="70" rx="12" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
        <rect x="335" y="100" width="10" height="18" rx="3" fill="#020291" opacity="0.3" />
        <rect x="350" y="90" width="10" height="28" rx="3" fill="#020291" opacity="0.5" />
        <rect x="365" y="82" width="10" height="36" rx="3" fill="#020291" opacity="0.7" />
        <rect x="380" y="75" width="10" height="43" rx="3" fill="#020291" />
      </g>

      {/* Floating checkmark */}
      <g className="float-fast">
        <circle cx="100" cy="150" r="22" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
        <path d="M90 150 L97 157 L112 142" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* Dots decoration */}
      <circle cx="420" cy="300" r="3" fill="#020291" opacity="0.15" />
      <circle cx="435" cy="310" r="2" fill="#020291" opacity="0.1" />
      <circle cx="80" cy="280" r="3" fill="#020291" opacity="0.15" />
      <circle cx="65" cy="270" r="2" fill="#020291" opacity="0.1" />
    </svg>
  );
}

/* ─── Feature Card Data ─── */
const features = [
  {
    icon: <DescriptionIcon sx={{ fontSize: 22 }} />,
    title: 'Create positions',
    desc: 'Define the role, upload a JD, set requirements — everything organized in one place.',
    color: '#020291',
    bgColor: '#EEF0FF',
  },
  {
    icon: <PeopleIcon sx={{ fontSize: 22 }} />,
    title: 'Tailored questions',
    desc: 'Get customized interview questions for every candidate based on the role and their background.',
    color: '#10b981',
    bgColor: '#ecfdf5',
  },
  {
    icon: <BarChartIcon sx={{ fontSize: 22 }} />,
    title: 'Score & compare',
    desc: 'Rate responses in real-time, analyze transcripts, and make data-driven hiring decisions.',
    color: '#f59e0b',
    bgColor: '#fffbeb',
  },
];

/* ─── Landing Page ─── */
export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  if (loading) return null;

  return (
    <Box sx={{ height: '100vh', bgcolor: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* ─── Navbar ─── */}
      <Box
        component="nav"
        sx={{
          borderBottom: '1px solid',
          borderColor: 'grey.100',
          bgcolor: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                bgcolor: '#020291',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>iH</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'grey.900' }}>iHire</Typography>
              <Typography sx={{ fontSize: 10, color: 'grey.400', fontWeight: 500, letterSpacing: '0.05em' }}>by FGS</Typography>
            </Box>
          </Box>

          {/* Auth Buttons */}
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => navigate('/login')}
              sx={{
                color: 'grey.700',
                fontSize: 14,
                fontWeight: 500,
                px: 2,
                '&:hover': { bgcolor: 'grey.50' },
              }}
            >
              Sign in
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate('/signup')}
              sx={{ fontSize: 14, px: 2.5, borderRadius: '8px' }}
            >
              Get started
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* ─── Hero Section ─── */}
      <Box component="section" sx={{ flex: 1, bgcolor: '#fff' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 8, lg: 12 } }}>
          <Grid container spacing={6} alignItems="center">
            {/* Left - Text */}
            <Grid size={{ xs: 12, lg: 6 }}>
              <Chip
                label="Smart Interview Platform"
                size="small"
                icon={<Box sx={{ width: 6, height: 6, bgcolor: '#020291', borderRadius: '50%', ml: 0.5 }} />}
                sx={{
                  bgcolor: '#EEF0FF',
                  color: '#020291',
                  fontWeight: 600,
                  fontSize: 12,
                  mb: 3,
                  border: '1px solid',
                  borderColor: '#BBC3FF',
                  '& .MuiChip-icon': { ml: '8px' },
                }}
              />

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 700,
                  color: 'grey.900',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  fontSize: { xs: '2.5rem', sm: '3.2rem' },
                }}
              >
                Hire smarter,
                <br />
                <Box component="span" sx={{ color: '#020291' }}>not harder.</Box>
              </Typography>

              <Typography
                sx={{
                  fontSize: 18,
                  color: 'grey.500',
                  mt: 2.5,
                  lineHeight: 1.7,
                  maxWidth: 420,
                }}
              >
                Streamline your entire interview process — from creating positions to making confident hiring decisions.
              </Typography>

              <Stack direction="row" spacing={1.5} sx={{ mt: 4 }}>
                <Button
                  variant="contained"
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 18 }} />}
                  onClick={() => navigate('/signup')}
                  sx={{ fontSize: 14, px: 3, py: 1.3, borderRadius: '8px' }}
                >
                  Start for free
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/login')}
                  sx={{
                    fontSize: 14,
                    px: 2.5,
                    py: 1.3,
                    borderRadius: '8px',
                    borderColor: 'grey.300',
                    color: 'grey.700',
                    '&:hover': { borderColor: 'grey.400', bgcolor: 'grey.50' },
                  }}
                >
                  Sign in
                </Button>
              </Stack>

              <Stack direction="row" spacing={3} sx={{ mt: 5 }}>
                {['Free to use', 'No credit card'].map((text) => (
                  <Stack key={text} direction="row" spacing={0.7} alignItems="center">
                    <CheckCircleIcon sx={{ fontSize: 18, color: '#10b981' }} />
                    <Typography sx={{ fontSize: 14, color: 'grey.400' }}>{text}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>

            {/* Right - Illustration (hidden on mobile) */}
            <Grid size={{ xs: 12, lg: 6 }} sx={{ display: { xs: 'none', lg: 'block' } }}>
              <HeroIllustration />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ─── Features Section ─── */}
      <Box component="section" sx={{ bgcolor: '#f9fafb', borderTop: '1px solid', borderColor: 'grey.100' }}>
        <Container maxWidth="lg" sx={{ py: 10 }}>
          <Box sx={{ textAlign: 'center', mb: 7 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'grey.900' }}>
              Everything you need to hire well
            </Typography>
            <Typography sx={{ color: 'grey.500', mt: 1, fontSize: 15 }}>
              A simple, powerful workflow for your interviews
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {features.map((f, i) => (
              <Grid size={{ xs: 12, md: 4 }} key={i}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: 'grey.100',
                    bgcolor: '#fff',
                    transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.08)' },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      bgcolor: f.bgColor,
                      color: f.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2,
                    }}
                  >
                    {f.icon}
                  </Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'grey.900', mb: 1 }}>
                    {f.title}
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: 'grey.500', lineHeight: 1.6 }}>
                    {f.desc}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ─── Footer ─── */}
      <Box component="footer" sx={{ bgcolor: '#fff', borderTop: '1px solid', borderColor: 'grey.100', py: 4 }}>
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
          >
            {/* Logo */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: '#020291',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>iH</Typography>
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'grey.700' }}>iHire</Typography>
            </Box>

            <Typography sx={{ fontSize: 13, color: 'grey.400' }}>
              &copy; {new Date().getFullYear()} iHire by FGS. All rights reserved.
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
