import { createSlice } from '@reduxjs/toolkit'

const LEGACY_STORAGE_KEYS = [
  'token',
  'refreshToken',
  'userInfo',
  'tokenExpireTime',
  'favorites',
  'reviews',
]

/** 清除旧版 localStorage 会话/业务缓存（一次性迁移） */
export function clearLegacyAuthStorage() {
  if (typeof localStorage === 'undefined') return
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
}

const initialAuthState = {
  isLogin: false,
  token: '',
  userInfo: null,
  tokenExpireTime: 0,
  sessionStatus: 'bootstrapping',
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,

  reducers: {
    loginSuccess: (state, action) => {
      state.isLogin = true
      state.token = action.payload.token
      state.userInfo = action.payload.userInfo

      const expiresIn = action.payload.expiresIn
      let timeout = 1000 * 60 * 25
      if (typeof expiresIn === 'string' && expiresIn.endsWith('m')) {
        timeout = parseInt(expiresIn, 10) * 60 * 1000
      }
      state.tokenExpireTime = Date.now() + timeout
      state.sessionStatus = 'ready'
    },
    logout: (state) => {
      Object.assign(state, { ...initialAuthState, sessionStatus: 'ready' })
    },
    sessionBootstrapFailed: (state) => {
      state.sessionStatus = 'ready'
    },
  },
})

export const { loginSuccess, logout, sessionBootstrapFailed } = authSlice.actions
