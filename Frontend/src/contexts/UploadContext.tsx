import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { apiClient } from '../services/api'

interface FormInfo {
  jobTitle: string
  candidateName: string
  candidateMode: 'existing' | 'new'
}

interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number // 0-100 for cloud upload
  processingStep: string
  result: any | null
  error: string | null
  fileName: string | null
  fileSizeMb: string | null
  formInfo: FormInfo | null
}

interface UploadContextType {
  state: UploadState
  startCloudUpload: (file: File, cloudName: string, apiKey: string, timestamp: string, signature: string, folder: string) => Promise<string>
  startDirectUpload: (file: File, jobId: number, candidateId?: number | '') => Promise<any>
  startUrlUpload: (videoUrl: string, jobId: number, candidateId?: number | '') => Promise<any>
  startPolling: (videoInterviewId: number, initialData: any) => void
  setUploading: (uploading: boolean) => void
  setProgress: (progress: number) => void
  setProcessingStep: (step: string) => void
  setResult: (result: any) => void
  setError: (error: string | null) => void
  setFileName: (name: string | null, sizeMb: string | null) => void
  setFormInfo: (info: FormInfo) => void
  reset: () => void
  cancelUpload: () => void
}

const initialState: UploadState = {
  status: 'idle',
  progress: 0,
  processingStep: '',
  result: null,
  error: null,
  fileName: null,
  fileSizeMb: null,
  formInfo: null,
}

const UploadContext = createContext<UploadContextType | null>(null)

export const useUpload = (): UploadContextType => {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be inside UploadProvider')
  return ctx
}

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<UploadState>(initialState)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const pollingRef = useRef<boolean>(false)

  const update = useCallback((partial: Partial<UploadState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  const startCloudUpload = useCallback(async (file: File, cloudName: string, apiKey: string, timestamp: string, signature: string, folder: string): Promise<string> => {
    update({ status: 'uploading', progress: 0, fileName: file.name, fileSizeMb: (file.size / (1024 * 1024)).toFixed(2), result: null, error: null })
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr
      const fd = new FormData()
      fd.append('file', file); fd.append('api_key', apiKey); fd.append('timestamp', timestamp)
      fd.append('signature', signature); fd.append('folder', folder); fd.append('resource_type', 'video')
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`)
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) update({ progress: Math.round((e.loaded / e.total) * 100) }) }
      xhr.onload = () => {
        xhrRef.current = null
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).secure_url)
        else { update({ status: 'error', error: `Upload failed (${xhr.status})` }); reject(new Error(`Upload failed`)) }
      }
      xhr.onerror = () => { xhrRef.current = null; update({ status: 'error', error: 'Network error' }); reject(new Error('Network error')) }
      xhr.send(fd)
    })
  }, [update])

  const startDirectUpload = useCallback(async (file: File, jobId: number, candidateId?: number | ''): Promise<any> => {
    update({ status: 'uploading', progress: 0, fileName: file.name, fileSizeMb: (file.size / (1024 * 1024)).toFixed(2), result: null, error: null })
    const fd = new FormData()
    fd.append('file', file); fd.append('job_id', String(jobId))
    if (candidateId) fd.append('candidate_id', String(candidateId))
    const res = await apiClient.post('/api/video/test/upload-interview', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
    return res.data
  }, [update])

  const startUrlUpload = useCallback(async (videoUrl: string, jobId: number, candidateId?: number | ''): Promise<any> => {
    update({ status: 'processing', processingStep: 'Sending to server...' })
    const fd = new FormData()
    fd.append('video_url', videoUrl); fd.append('job_id', String(jobId))
    if (candidateId) fd.append('candidate_id', String(candidateId))
    const res = await apiClient.post('/api/video/test/upload-interview-url', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
    return res.data
  }, [update])

  const startPolling = useCallback((videoInterviewId: number, initialData: any) => {
    update({ status: 'processing', processingStep: 'Extracting audio & generating transcript...' })
    pollingRef.current = true
    const startTime = Date.now()

    const poll = async () => {
      if (!pollingRef.current) return
      if (Date.now() - startTime > 5 * 60 * 1000) {
        update({ status: 'completed', result: { ...initialData, status: 'completed', transcript_generated: false, fraud_analysis_done: false, transcript_error: 'Processing timed out.' } })
        pollingRef.current = false
        return
      }
      try {
        const res = await apiClient.get(`/api/video/test/processing-status/${videoInterviewId}`)
        const data = res.data
        let step = ''
        if (data.transcript === 'processing') step = data.transcript_step || 'Extracting audio & generating transcript...'
        else if (data.fraud === 'processing') step = 'Running fraud analysis on video...'
        else if (data.scoring === 'processing') step = 'Generating AI score from transcript...'
        else if (data.transcript === 'completed' && data.fraud === 'pending') step = 'Transcript done! Starting fraud analysis...'
        if (step) update({ processingStep: step })

        if (data.status === 'completed' || data.status === 'failed') {
          const finalResult = {
            ...initialData, status: 'completed',
            transcript_generated: data.transcript_generated, transcript_length: data.transcript_length || 0,
            transcript_error: data.transcript_error, fraud_analysis_done: data.fraud_analysis_done || false,
            scoring_done: data.scoring_done || false, overall_score: data.overall_score, recommendation: data.recommendation,
          }
          // If scoring not done yet, keep rechecking (scoring may lag behind fraud)
          if (!data.scoring_done && data.transcript_generated) {
            update({ status: 'completed', result: finalResult, processingStep: '' })
            let retries = 0
            const recheckScoring = async () => {
              if (retries >= 6) return // max 6 retries (30s total)
              retries++
              try {
                const recheck = await apiClient.get(`/api/video/test/processing-status/${videoInterviewId}`)
                const d = recheck.data
                if (d.scoring_done) {
                  update({ result: { ...finalResult, scoring_done: true, overall_score: d.overall_score, recommendation: d.recommendation } })
                  return
                }
              } catch { /* ignore */ }
              setTimeout(recheckScoring, 5000) // retry every 5s
            }
            setTimeout(recheckScoring, 5000)
          } else {
            update({ status: 'completed', result: finalResult, processingStep: '' })
          }
          pollingRef.current = false
          return
        }
      } catch { /* continue polling */ }
      if (pollingRef.current) setTimeout(poll, 3000)
    }
    poll()
  }, [update])

  const reset = useCallback(() => {
    pollingRef.current = false
    if (xhrRef.current) { try { xhrRef.current.abort() } catch {} }
    xhrRef.current = null
    setState(initialState)
  }, [])

  const cancelUpload = useCallback(() => {
    if (xhrRef.current) { try { xhrRef.current.abort() } catch {} }
    xhrRef.current = null
    pollingRef.current = false
    setState(initialState)
  }, [])

  return (
    <UploadContext.Provider value={{
      state,
      startCloudUpload, startDirectUpload, startUrlUpload, startPolling,
      setUploading: (v) => update({ status: v ? 'uploading' : 'idle' }),
      setProgress: (p) => update({ progress: p }),
      setProcessingStep: (s) => update({ processingStep: s }),
      setResult: (r) => update({ status: 'completed', result: r }),
      setError: (e) => update({ status: e ? 'error' : 'idle', error: e }),
      setFileName: (n, s) => update({ fileName: n, fileSizeMb: s }),
      setFormInfo: (info) => update({ formInfo: info }),
      reset, cancelUpload,
    }}>
      {children}
    </UploadContext.Provider>
  )
}
