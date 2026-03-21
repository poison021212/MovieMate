import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate, useLocation } from 'react-router-dom'

const NeedAuth = (props) => {
  const auth = useSelector(state => state.auth)
  const location = useLocation()
  return (
    <div>
      {/* 如果用户未登录，重定向到登录页面,并将当前路径作为state传递,登录后重定向回当前路径 */}
      {auth.isLogin ? props.children : <Navigate to='/auth' replace state={{ from: location }} />}
    </div>
  )
}

export default NeedAuth