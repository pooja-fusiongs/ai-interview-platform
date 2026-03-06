/**
 * Utility functions for handling media devices and permissions
 */

export interface DeviceInfo {
  hasVideo: boolean;
  hasAudio: boolean;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
}

export const getMediaDevices = async (): Promise<DeviceInfo> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const audioDevices = devices.filter(device => device.kind === 'audioinput');
    
    return {
      hasVideo: videoDevices.length > 0,
      hasAudio: audioDevices.length > 0,
      videoDevices,
      audioDevices
    };
  } catch (error) {
    console.error('Failed to enumerate devices:', error);
    return {
      hasVideo: false,
      hasAudio: false,
      videoDevices: [],
      audioDevices: []
    };
  }
};

export const requestMediaPermissions = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
  try {
    // If no constraints provided, check what devices are available first
    if (!constraints) {
      const deviceInfo = await getMediaDevices();
      
      if (!deviceInfo.hasVideo && !deviceInfo.hasAudio) {
        throw new Error('No media devices found');
      }
      
      constraints = {};
      if (deviceInfo.hasAudio) constraints.audio = true;
      if (deviceInfo.hasVideo) constraints.video = true;
    }
    
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error: any) {
    console.error('Media permission error:', error);
    throw error;
  }
};

export const getDeviceErrorMessage = (error: any): string => {
  if (error.name === 'NotFoundError') {
    return 'No camera or microphone found. Please connect devices and refresh.';
  } else if (error.name === 'NotAllowedError') {
    return 'Camera/microphone access denied. Please allow permissions in browser settings.';
  } else if (error.name === 'NotReadableError') {
    return 'Camera or microphone is already in use by another application.';
  } else if (error.name === 'OverconstrainedError') {
    return 'Camera does not support the required settings. Try a different camera.';
  } else if (error.message === 'No media devices found') {
    return 'No camera or microphone found. Please connect devices and refresh.';
  } else {
    return 'Camera/microphone access issue. Please check device connections.';
  }
};

export const createAudioOnlyConstraints = (): MediaStreamConstraints => {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };
};
