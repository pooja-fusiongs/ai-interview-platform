import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', p: 4, textAlign: 'center', background: '#f8fafc',
        }}>
          <Typography sx={{ fontSize: '48px', mb: 2 }}>Something went wrong</Typography>
          <Typography sx={{ color: '#64748b', mb: 4, maxWidth: 500 }}>
            An unexpected error occurred. Please try reloading the page.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={this.handleReload}
              sx={{ background: '#020291', textTransform: 'none', fontWeight: 600, borderRadius: '10px', '&:hover': { background: '#06109E' } }}>
              Reload Page
            </Button>
            <Button variant="outlined" onClick={this.handleGoHome}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', borderColor: '#020291', color: '#020291' }}>
              Go to Dashboard
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
