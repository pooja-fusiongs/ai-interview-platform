/**
 * Activity Service
 * Handles user activity tracking and online status updates
 */

import { apiClient } from './api';

class ActivityService {
  private activityInterval: NodeJS.Timeout | null = null;
  private isTracking = false;

  /**
   * Start tracking user activity
   */
  startTracking() {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    console.log('🟢 Starting activity tracking...');

    // Update activity immediately
    this.updateActivity();

    // Set up periodic activity updates (every 2 minutes)
    this.activityInterval = setInterval(() => {
      this.updateActivity();
    }, 120000); // 2 minutes

    // Track user interactions
    this.setupEventListeners();
  }

  /**
   * Stop tracking user activity
   */
  stopTracking() {
    if (!this.isTracking) {
      return;
    }

    this.isTracking = false;
    console.log('🔴 Stopping activity tracking...');

    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }

    // Remove event listeners
    this.removeEventListeners();
  }

  /**
   * Update user activity on the server
   */
  private async updateActivity() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('⚠️ No auth token found, stopping activity tracking');
        this.stopTracking();
        return;
      }

      await apiClient.post('/api/auth/activity');
      console.log('✅ Activity updated');
    } catch (error) {
      console.error('❌ Failed to update activity:', error);
      
      // If unauthorized, stop tracking
      if (error.response?.status === 401) {
        console.log('🔴 Unauthorized, stopping activity tracking');
        this.stopTracking();
      }
    }
  }

  /**
   * Set up event listeners for user interactions
   */
  private setupEventListeners() {
    // Track various user interactions
    const events = ['click', 'keypress', 'scroll', 'mousemove'];
    
    events.forEach(event => {
      document.addEventListener(event, this.handleUserInteraction, { passive: true });
    });
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners() {
    const events = ['click', 'keypress', 'scroll', 'mousemove'];
    
    events.forEach(event => {
      document.removeEventListener(event, this.handleUserInteraction);
    });
  }

  /**
   * Handle user interaction events
   */
  private handleUserInteraction = (() => {
    let lastUpdate = 0;
    const throttleDelay = 60000; // 1 minute throttle

    return () => {
      const now = Date.now();
      if (now - lastUpdate > throttleDelay) {
        lastUpdate = now;
        this.updateActivity();
      }
    };
  })();

  /**
   * Check if activity tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }
}

// Create singleton instance
export const activityService = new ActivityService();

export default activityService;