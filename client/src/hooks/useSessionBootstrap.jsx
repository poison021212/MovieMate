import { useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { loginSuccess, clearLegacyAuthStorage } from '@/store/Slice/authSlice'
import { useRefreshTokenMutation } from '@/store/API/authApi'

/** 页面加载时用 HttpOnly Cookie 静默续期，access/user 仅驻内存 */
export default function useSessionBootstrap() {
  const auth = useSelector((state) => state.auth)
  const dispatch = useDispatch()
  const [refreshTokenFn] = useRefreshTokenMutation()
  const triedRef = useRef(false)

  useEffect(() => {
    clearLegacyAuthStorage()
  }, [])

  useEffect(() => {
    if (auth.isLogin || triedRef.current) return
    triedRef.current = true
    refreshTokenFn({})
      .unwrap()
      .then((data) => {
        dispatch(
          loginSuccess({
            token: data.accessToken || data.jwt,
            userInfo: data.user,
            expiresIn: data.expiresIn,
          })
        )
      })
      .catch(() => {
        /* 无有效 cookie，保持未登录 */
      })
  }, [auth.isLogin, dispatch, refreshTokenFn])
}
