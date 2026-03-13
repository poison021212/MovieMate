import { createSlice } from '@reduxjs/toolkit'

export const authSlice = createSlice({
  name: 'auth',
  initialState: () => {
    const token = localStorage.getItem('token')
    let userInfo = null

    // 安全地解析 userInfo
    try {
      const userInfoStr = localStorage.getItem('userInfo')
      if (userInfoStr && userInfoStr !== '[object Object]') {
        userInfo = JSON.parse(userInfoStr)
      }
    } catch (error) {
      console.error('解析 userInfo 失败:', error)
      userInfo = null
      // 清除无效的 localStorage 数据
      localStorage.removeItem('userInfo')
    }
    if (token) {
      return {
        isLogin: true,
        token,// 服务器发送给我们的token默认有效期为1个月
        // 将字符串转换为对象
        userInfo,
        tokenExpireTime: localStorage.getItem('tokenExpireTime')
      }
    }
    return {
      isLogin: false,
      token: '',
      userInfo: null,//用户信息
      tokenExpireTime: 0
    }
  },

  // 登录的用户信息都存在reducer中,刷新会丢失,需要从localStorage中获取
  reducers: {
    loginSuccess: (state, action) => {
      state.isLogin = true
      state.token = action.payload.token
      state.userInfo = action.payload.userInfo

      const currentTime = Date.now()
      const timeout = 1000 * 10 * 60 * 24 // 1天
      state.tokenExpireTime = currentTime + timeout
      // 登录成功后,将用户信息存储到localStorage中
      localStorage.setItem('token', state.token)
      // userInfo里存储的是对象,直接state.userInfo出来的是[object Object],需要转换为字符串
      localStorage.setItem('userInfo', JSON.stringify(state.userInfo))
      localStorage.setItem('tokenExpireTime', state.tokenExpireTime)
    },
    logout: (state) => {
      state.isLogin = false
      state.token = null
      state.userInfo = null
      // 退出登录后,需要从localStorage中删除用户信息
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      localStorage.removeItem('tokenExpireTime')
    }
  }
})

export const { loginSuccess, logout } = authSlice.actions
