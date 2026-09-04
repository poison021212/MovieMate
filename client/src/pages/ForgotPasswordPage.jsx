import { useState } from 'react'
import { Form, Input, Button, Alert, message } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useForgotPasswordMutation } from '@/store/API/authApi'

export default function ForgotPasswordPage() {
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation()
  const [done, setDone] = useState(false)

  const onFinish = async (values) => {
    try {
      await forgotPassword({ email: values.email.trim().toLowerCase() }).unwrap()
      setDone(true)
      message.success('若邮箱已注册，将收到重置链接')
    } catch (err) {
      message.error(err?.data?.error?.message || '请求失败')
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '48px auto', padding: 24 }}>
      <h2>忘记密码</h2>
      {done ? (
        <Alert
          type="info"
          showIcon
          message="请查收邮件"
          description="若该邮箱已注册，将收到密码重置链接（Demo 环境请查看后端控制台日志）。"
        />
      ) : (
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="email"
            label="注册邮箱"
            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading}>
              发送重置链接
            </Button>
          </Form.Item>
        </Form>
      )}
      <Link to="/auth">返回登录</Link>
    </div>
  )
}
