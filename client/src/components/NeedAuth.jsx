import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'

const NeedAuth = (props) => {
  const auth = useSelector((state) => state.auth)
  const location = useLocation()

  if (auth.sessionStatus === 'bootstrapping') {
    return <Spin style={{ display: 'block', margin: '48px auto' }} />
  }

  return (
    <div>
      {auth.isLogin ? (
        props.children
      ) : (
        <Navigate to="/auth" replace state={{ from: location }} />
      )}
    </div>
  )
}

export default NeedAuth
