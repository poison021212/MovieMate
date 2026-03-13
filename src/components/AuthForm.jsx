import React from 'react'
import { useState } from 'react'
import { useRegisterMutation, useLoginMutation } from '@/store/API/authApi'
import { useDispatch } from 'react-redux'
import { loginSuccess } from '@/store/Slice/authSlice'
import { useNavigate, useLocation } from 'react-router-dom'
import { LockOutlined, UserOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Checkbox, Flex, Form, Input, Alert } from 'antd';

const AuthForm = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [isLoginForm, setIsLoginForm] = useState(true)
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false)
  const [showLoginSuccess, setShowLoginSuccess] = useState(false)

  const [regFn, { error: registerError }] = useRegisterMutation()
  const [loginFn, { error: loginError }] = useLoginMutation()

  const onFinish = async (values) => {
    if (isLoginForm) {
      const result = await loginFn({
        identifier: values.username,
        password: values.password
      })
      console.log(result)
      if (!result.error) {
        dispatch(loginSuccess({
          token: result.data.jwt,
          userInfo: result.data.user
        }))
        setShowLoginSuccess(true)
        setTimeout(() => {
          navigate(from, { replace: true })
        }, 1000)
      }
    } else {
      const result = await regFn({
        username: values.username,
        password: values.password,
        email: values.email
      })
      if (!result.error) {
        setShowRegisterSuccess(true)
        setTimeout(() => {
          setIsLoginForm(true)
          setShowRegisterSuccess(false)
        }, 2000)
      }
    }
  }

  const switchFormHandler = () => {
    setIsLoginForm(!isLoginForm)
    setShowRegisterSuccess(false)
    setShowLoginSuccess(false)
  }

  return (
    <div>
      <Form
        name="auth"
        initialValues={{ remember: false }}
        style={{ maxWidth: 360, margin: '1.33rem auto' }}
        onFinish={onFinish}
      >
        <Form.Item
          name="username"
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item
          name="password"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input prefix={<LockOutlined />} type="password" placeholder="请输入密码" />
        </Form.Item>
        {!isLoginForm && (
          <Form.Item
            name="email"
            rules={[{ required: true, message: '请输入邮箱' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入邮箱" />
          </Form.Item>
        )}
        <Form.Item>

          {/* <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住密码</Checkbox>
            </Form.Item> */}

          <a href='#' style={{ float: 'right' }} onClick={(e) => { e.preventDefault(); switchFormHandler() }}>
            {isLoginForm ? '没有账号？去注册' : '已经有账号？去登录'}
          </a>
        </Form.Item>
        <Form.Item>
          <Button block type="primary" htmlType="submit">
            {!isLoginForm ? '注册' : '登录'}
          </Button>
        </Form.Item>
        {showRegisterSuccess && (
          <Alert
            message="注册成功"
            description="恭喜您，注册成功！"
            type="success"
            showIcon
            closable
            onClose={() => setShowRegisterSuccess(false)}
          />
        )}
        {registerError && !isLoginForm && (
          <Alert
            message="注册失败"
            description={registerError.message || '注册失败，请检查用户名或电子邮件是否已存在'}
            type="error"
            showIcon
            closable
          />
        )}
        {showLoginSuccess && (
          <Alert
            title="登录成功"
            description="登录成功！即将跳转..."
            type="success"
            showIcon
            closable
            onClose={() => setShowLoginSuccess(false)}
          />
        )}
        {loginError && isLoginForm && (
          <Alert
            title="登录失败"
            description={loginError.message || '登录失败，请检查用户名或密码是否正确'}
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