import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Alert, Button, Spin } from 'antd'
import { useVerifyEmailMutation } from '@/store/API/authApi'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [verifyEmail] = useVerifyEmailMutation()
  const [status, setStatus] = useState('pending')
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('缺少验证 token')
      return
    }
    if (started.current) return
    started.current = true

    verifyEmail({ token })
      .unwrap()
      .then((res) => {
        setStatus('success')
        setMessage(res.message || '邮箱验证成功')
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err?.data?.error?.message || '验证失败')
      })
  }, [token, verifyEmail])

  if (status === 'pending') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin /> 正在验证邮箱…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: 24 }}>
      <Alert
        type={status === 'success' ? 'success' : 'error'}
        message={status === 'success' ? '验证成功' : '验证失败'}
        description={message}
        showIcon
      />
      <Link to="/auth">
        <Button type="primary" block style={{ marginTop: 16 }}>
          去登录
        </Button>
      </Link>
    </div>
  )
}
