import { useSelector, useDispatch } from 'react-redux'
import { logout, loginSuccess } from '@/store/Slice/authSlice'
import { useRefreshTokenMutation } from '@/store/API/authApi'
import { useEffect } from 'react'

const useAutoLogout = () => {
  const auth = useSelector((state) => state.auth)
  const dispatch = useDispatch()
  const [refreshTokenFn] = useRefreshTokenMutation()

  useEffect(() => {
    if (!auth.isLogin || !auth.tokenExpireTime) return

    const timeout = auth.tokenExpireTime - Date.now()

    if (timeout < 60_000) {
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
        .catch(() => dispatch(logout()))
      return
    }

    if (timeout < 6000) {
      dispatch(logout())
      return
    }

    const timer = setTimeout(() => {
      dispatch(logout())
    }, timeout)

    return () => clearTimeout(timer)
  }, [auth, dispatch, refreshTokenFn])
}

export default useAutoLogout
