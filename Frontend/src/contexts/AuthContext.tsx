import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { AuthContextType, User, SignupData } from '../types'
import { authService } from '../services/authService'
import { apiClient } from '../services/api'
import { activityService } from '../services/activityService'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    // Check if user is logged in on app start
    const token = localStorage.getItem('token')
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
      // Verify token with backend
      verifyToken()
    } else {
      setLoading(false)
    }
  }, [])

  const verifyToken = async (): Promise<void> => {
    try {
      const userData = await authService.getCurrentUser()
      setUser({
        id: userData.id.toString(),
        username: userData.username,
        name: userData.name || userData.username,
        email: userData.email,
        company: userData.company,
        role: userData.role
      })

      // Start activity tracking for verified users
      activityService.startTracking()
    } catch (error) {
      localStorage.removeItem('token')
      delete apiClient.defaults.headers.common['Authorization']
      activityService.stopTracking()
    } finally {
      setLoading(false)
    }
  }

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      console.log('🔐 Attempting login for:', username)

      const data = await authService.login(username, password)
      console.log('✅ Login response:', data)

      const { access_token } = data

      if (!access_token) {
        throw new Error('No access token received')
      }

      localStorage.setItem('token', access_token)
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

      // Always fetch complete user data from /api/auth/me to ensure we have correct username
      try {
        const userData = await authService.getCurrentUser()
        setUser({
          id: userData.id.toString(),
          username: userData.username,
          name: userData.name || userData.username,
          email: userData.email,
          company: userData.company || '',
          role: userData.role
        })
      } catch (fetchError) {
        console.error('Failed to fetch user data:', fetchError)
        // Fallback to login response data if getCurrentUser fails
        const { role, user_id, user } = data
        if (user) {
          setUser({
            id: user.id.toString(),
            username: user.username,
            name: user.name || user.username,
            email: user.email,
            company: user.company || '',
            role: user.role
          })
        } else {
          setUser({
            id: user_id?.toString() || '0',
            username: username,
            name: username,
            email: username,
            company: '',
            role: role || 'candidate'
          })
        }
      }

      console.log('✅ Login successful, user set')

      // Start activity tracking after successful login
      activityService.startTracking()

      return { success: true }

    } catch (error: any) {
      console.error('❌ Login error:', error)

      // Clear any partial auth state
      localStorage.removeItem('token')
      delete apiClient.defaults.headers.common['Authorization']
      setUser(null)

      let errorMessage = 'Login failed'

      if (error.response?.status === 401) {
        errorMessage = 'Invalid email or password'
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.message) {
        errorMessage = error.message
      }

      return {
        success: false,
        message: errorMessage
      }
    }
  }

  const signup = async (userData: SignupData): Promise<{ success: boolean; message?: string }> => {
    try {
      // Create the account
      await authService.signup({
        username: userData.username,
        email: userData.email,
        password: userData.password,
        company: userData.company || '', // Make company optional with empty string default
        role: userData.role || 'candidate'  // Default role or specified role
      })
      
      // Automatically login after successful signup
      const loginResult = await login(userData.username, userData.password)
      
      if (loginResult.success) {
        return { success: true, message: 'Account created and logged in successfully!' }
      } else {
        return { success: true, message: 'Account created successfully! Please login.' }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.detail || 'Signup failed' 
      }
    }
  }

  const logout = (): void => {
    // Tell backend user is offline before clearing token
    apiClient.post('/api/auth/logout').catch(() => {})

    // Stop activity tracking on logout
    activityService.stopTracking()

    localStorage.removeItem('token')
    delete apiClient.defaults.headers.common['Authorization']
    setUser(null)
  }

  const demoLogin = async (): Promise<{ success: boolean }> => {
    try {
      // Use the working test credentials
      const result = await login('pooja@fusiongs.com', 'password123')
      return result
    } catch (error) {
      console.error('Demo login failed:', error)
      return { success: false }
    }
  }

  const value: AuthContextType = {
    user,
    login,
    signup,
    logout,
    demoLogin,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}