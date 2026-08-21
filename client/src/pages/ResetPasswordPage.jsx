import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Alert, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useResetPasswordMutation } from '@/store/API/authApi'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [resetPassword, { isLoading }] = useResetPasswordMutation()
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div style={{ maxWidth: 420, margin: '48px auto', padding: 24 }}>
        <Alert type="error" message="无效链接" description="缺少重置 token" showIcon />
        <Link to="/auth/forgot-password">重新申请</Link>
      </div>
    )
  }

  const onFinish = async (values) => {
    try {
      await resetPassword({ token, password: values.password }).unwrap()
      setDone(true)
      message.success('密码已重置')
      setTimeout(() => navigate('/auth', { replace: true }), 1500)
    } catch (err) {
      message.error(err?.data?.error?.message || '重置失败')
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '48px auto', padding: 24 }}>
      <h2>重置密码</h2>
      {done ? (
        <Alert type="success" showIcon message="密码已更新" description="即将跳转登录页…" />
      ) : (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_!@#$%^&*.-]{8,32}$/,
                message: '密码需 8-32 位且包含字母与数字',
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="新密码" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再次输入" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isLoading}>
            确认重置
          </Button>
        </Form>
      )}
    </div>
  )
}
