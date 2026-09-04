import React, { useState, useEffect } from 'react'
import {
  useRegisterMutation,
  useLoginMutation,
  useResendVerificationMutation,
} from '@/store/API/authApi'
import { useDispatch, useSelector } from 'react-redux'
import { loginSuccess } from '@/store/Slice/authSlice'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { LockOutlined, UserOutlined, MailOutlined } from '@ant-design/icons'
import { Button, Form, Input, Alert, message } from 'antd'

const AuthForm = () => {
  const dispatch = useDispatch()
  const auth = useSelector((state) => state.auth)
  const navigate = useNavigate()
  const location = useLocation()
  const fromLocation = location.state?.from
  const redirectTo = fromLocation
    ? `${fromLocation.pathname || '/'}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : '/'

  const [isLoginForm, setIsLoginForm] = useState(true)
  const [registerEmailHint, setRegisterEmailHint] = useState('')
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('')

  const [regFn, { error: registerError, reset: resetRegister }] = useRegisterMutation()
  const [loginFn, { error: loginError, reset: resetLogin }] = useLoginMutation()
  const [resendVerification, { isLoading: resendLoading }] = useResendVerificationMutation()

  useEffect(() => {
    if (auth.sessionStatus === 'ready' && auth.isLogin) {
      navigate(redirectTo, { replace: true })
    }
  }, [auth.sessionStatus, auth.isLogin, navigate, redirectTo])

  const clearAuthAlerts = () => {
    setRegisterEmailHint('')
    setPendingVerifyEmail('')
  }

  const onFinish = async (values) => {
    if (isLoginForm) {
      const result = await loginFn({
        identifier: values.username,
        password: values.password,
      })
      if (!result.error) {
        dispatch(
          loginSuccess({
            token: result.data.accessToken || result.data.jwt,
            userInfo: result.data.user,
            expiresIn: result.data.expiresIn,
          })
        )
        message.success('登录成功')
        navigate(redirectTo, { replace: true })
      } else {
        const msg = result.error?.data?.error?.message || ''
        if (msg.includes('邮箱尚未验证')) {
          const email = values.username.includes('@')
            ? values.username.trim().toLowerCase()
            : registerEmailHint
          if (email) {
            setRegisterEmailHint('')
            setPendingVerifyEmail(email)
          }
          resetLogin()
        }
      }
    } else {
      const result = await regFn({
        username: values.username,
        password: values.password,
        email: values.email.trim().toLowerCase(),
      })
      if (!result.error) {
        const email = values.email.trim().toLowerCase()
        setRegisterEmailHint(email)
        setPendingVerifyEmail('')
        resetLogin()
        resetRegister()
        setIsLoginForm(true)
        message.success('注册成功，请验证邮箱后登录')
      }
    }
  }

  const handleResend = async () => {
    const email = pendingVerifyEmail || registerEmailHint
    if (!email || !email.includes('@')) {
      message.warning('无法识别邮箱，请使用注册时的邮箱地址')
      return
    }
    try {
      await resendVerification({ email }).unwrap()
      message.success('验证邮件已发送（Demo 请查看后端控制台）')
    } catch (err) {
      message.error(err?.data?.error?.message || '发送失败')
    }
  }

  const switchFormHandler = () => {
    resetLogin()
    resetRegister()
    clearAuthAlerts()
    setIsLoginForm(!isLoginForm)
  }

  const showLoginError =
    isLoginForm && loginError && !registerEmailHint && !pendingVerifyEmail

  return (
    <div>
      <Form
        name="auth"
        style={{ maxWidth: 360, margin: '1.33rem auto' }}
        onFinish={onFinish}
      >
        <Form.Item
          name="username"
          rules={[{ required: true, message: isLoginForm ? '请输入用户名或邮箱' : '请输入用户名' }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder={isLoginForm ? '用户名或邮箱' : '请输入用户名'}
          />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[
            { required: true, message: '请输入密码' },
            ...(!isLoginForm
              ? [
                  {
                    pattern: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_!@#$%^&*.-]{8,32}$/,
                    message: '密码需 8-32 位且包含字母与数字',
                  },
                ]
              : []),
          ]}
        >
          <Input prefix={<LockOutlined />} type="password" placeholder="请输入密码" />
        </Form.Item>
        {!isLoginForm && (
          <Form.Item
            name="email"
            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入邮箱" />
          </Form.Item>
        )}
        <Form.Item>
          {isLoginForm && (
            <Link to="/auth/forgot-password" style={{ float: 'left' }}>
              忘记密码？
            </Link>
          )}
          <a
            href="#"
            style={{ float: 'right' }}
            onClick={(e) => {
              e.preventDefault()
              switchFormHandler()
            }}
          >
            {isLoginForm ? '没有账号？去注册' : '已经有账号？去登录'}
          </a>
        </Form.Item>
        <Form.Item>
          <Button block type="primary" htmlType="submit">
            {!isLoginForm ? '注册' : '登录'}
          </Button>
        </Form.Item>

        {registerEmailHint && (
          <Alert
            type="info"
            showIcon
            message="请验证邮箱"
            description={
              <span>
                已向 {registerEmailHint} 发送验证链接。Demo 环境请在后端控制台复制
                「邮箱验证链接」并在浏览器打开，验证完成后再登录。
                <Button type="link" size="small" loading={resendLoading} onClick={handleResend}>
                  重发验证邮件
                </Button>
              </span>
            }
            style={{ marginBottom: 12 }}
          />
        )}

        {pendingVerifyEmail && isLoginForm && !registerEmailHint && (
          <Alert
            type="warning"
            showIcon
            message="邮箱尚未验证"
            description={
              <span>
                请先完成邮箱验证后再登录。
                <Button type="link" size="small" loading={resendLoading} onClick={handleResend}>
                  重发验证邮件
                </Button>
              </span>
            }
            style={{ marginBottom: 12 }}
          />
        )}

        {registerError && !isLoginForm && (
          <Alert
            message="注册失败"
            description={registerError.data?.error?.message || registerError.message || '注册失败'}
            type="error"
            showIcon
            closable
          />
        )}
        {showLoginError && (
          <Alert
            title="登录失败"
            description={loginError.data?.error?.message || loginError.message || '登录失败'}
            type="error"
            showIcon
            closable
          />
        )}
      </Form>
    </div>
  )
}

export default AuthForm
