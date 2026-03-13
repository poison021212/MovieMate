import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '@/store/Slice/authSlice'
import { useEffect } from 'react'

const useAutoLogout = () => {
  const auth = useSelector(state => state.auth)
  const dispatch = useDispatch()
  // 创建一个useEffect，用来处理登录状态
  useEffect(() => {
    const timeout = auth.tokenExpireTime - Date.now();
    // 判断timeout的值
    if (timeout < 6000) {
      dispatch(logout());
      return;
    }
    const timer = setTimeout(() => {
      dispatch(logout());
    }, timeout);
    //  组件卸载时,清除定时器
    return () => {
      clearTimeout(timer);
    };
  }, [auth]);
}

export default useAutoLogout