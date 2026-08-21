import { createSlice } from '@reduxjs/toolkit'

function readStoredUserInfo() {
  try {
    const userInfoStr = localStorage.getItem('userInfo')
    if (userInfoStr && userInfoStr !== '[object Object]') {
      return JSON.parse(userInfoStr)
    }
  } catch {
    localStorage.removeItem('userInfo')
  }
  return null
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: () => {
    const token = localStorage.getItem('token')
    const refreshToken = localStorage.getItem('refreshToken')
    const userInfo = readStoredUserInfo()
    const tokenExpireTime = Number(localStorage.getItem('tokenExpireTime') || 0)

    if (token) {
      return {
        isLogin: true,
        token,
        refreshToken: refreshToken || '',
        userInfo,
        tokenExpireTime,
      }
    }
    return {
      isLogin: false,
      token: '',
      refreshToken: '',
      userInfo: null,
      tokenExpireTime: 0,
    }
  },

  reducers: {
    loginSuccess: (state, action) => {
      state.isLogin = true
      state.token = action.payload.token
      state.refreshToken = action.payload.refreshToken || state.refreshToken || ''
      state.userInfo = action.payload.userInfo

      const expiresIn = action.payload.expiresIn
      let timeout = 1000 * 60 * 25
      if (typeof expiresIn === 'string' && expiresIn.endsWith('m')) {
        timeout = parseInt(expiresIn, 10) * 60 * 1000
      }
      state.tokenExpireTime = Date.now() + timeout

      localStorage.setItem('token', state.token)
      localStorage.setItem('refreshToken', state.refreshToken)
      localStorage.setItem('userInfo', JSON.stringify(state.userInfo))
      localStorage.setItem('tokenExpireTime', String(state.tokenExpireTime))
    },
    logout: (state) => {
      state.isLogin = false
      state.token = ''
      state.refreshToken = ''
      state.userInfo = null
      state.tokenExpireTime = 0
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('userInfo')
      localStorage.removeItem('tokenExpireTime')
    },
  },
})

export const { loginSuccess, logout } = authSlice.actions
