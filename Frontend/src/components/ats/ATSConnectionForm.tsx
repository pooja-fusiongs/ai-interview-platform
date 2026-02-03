import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert, Box
} from '@mui/material';
import atsService from '../../services/atsService';

interface Connection {
  id?: number;
  provider: string;
  api_key?: string;
  base_url?: string;
}

interface ATSConnectionFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  connection?: Connection;
}

const ATSConnectionForm: React.FC<ATSConnectionFormProps> = ({ open, onClose, onSaved, connection }) => {
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (connection) {
      setProvider(connection.provider || '');
      setApiKey('');
      setBaseUrl(connection.base_url || '');
    } else {
      setProvider('');
      setApiKey('');
      setBaseUrl('');
    }
    setError('');
  }, [connection, open]);

  const handleSubmit = async () => {
    if (!provider || !apiKey) {
      setError('Provider and API Key are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { provider, api_key: apiKey, base_url: baseUrl };
      if (connection?.id) {
        await atsService.updateConnection(connection.id, payload);
      } else {
        await atsService.createConnection(payload);
      }
      onSaved();
    } catch (err) {
      setError('Failed to save connection. Please check your credentials.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{connection ? 'Edit ATS Connection' : 'Add ATS Connection'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControl fullWidth>
            <InputLabel>Provider</InputLabel>
            <Select
              value={provider}
              label="Provider"
              onChange={e => setProvider(e.target.value)}
            >
              <MenuItem value="Greenhouse">Greenhouse</MenuItem>
              <MenuItem value="Lever">Lever</MenuItem>
              <MenuItem value="BambooHR">BambooHR</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="API Key"
            type="password"
            fullWidth
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={connection ? '••••••••' : 'Enter API key'}
            required
          />
          <TextField
            label="Base URL"
            fullWidth
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            helperText="Optional. Override the default API endpoint."
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : connection ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ATSConnectionForm;
