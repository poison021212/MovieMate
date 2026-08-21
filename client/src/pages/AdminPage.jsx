import React from 'react'
import { Card, Table, Tag, Button, Space, Tabs, Typography, message, Popconfirm } from 'antd'
import {
  useGetAdminMeQuery,
  useListAdminUsersQuery,
  useUpdateUserStatusMutation,
  useListAdminReviewsQuery,
  useDeleteAdminReviewMutation,
  useListAdminAuditQuery,
} from '@/store/API/adminApi'
import NeedAuth from '@/components/NeedAuth'

const { Title, Text } = Typography

function AdminContent() {
  const { data: meData, error: meError, isLoading: meLoading } = useGetAdminMeQuery()
  const { data: usersData, isLoading: usersLoading } = useListAdminUsersQuery(undefined, {
    skip: !meData?.admin,
  })
  const { data: reviewsData, isLoading: reviewsLoading } = useListAdminReviewsQuery(undefined, {
    skip: !meData?.admin,
  })
  const { data: auditData, isLoading: auditLoading } = useListAdminAuditQuery(undefined, {
    skip: !meData?.admin,
  })
  const [updateStatus] = useUpdateUserStatusMutation()
  const [deleteReview] = useDeleteAdminReviewMutation()

  if (meLoading) return <Card loading />
  if (meError || !meData?.admin) {
    return (
      <Card>
        <Title level={4}>无权限</Title>
        <Text type="secondary">需要管理员账号（users.role = admin）。</Text>
      </Card>
    )
  }

  const statusTag = (status) => {
    const map = { active: 'green', locked: 'orange', banned: 'red' }
    return <Tag color={map[status] || 'default'}>{status}</Tag>
  }

  const userColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    { title: '角色', dataIndex: 'role', render: (r) => <Tag>{r}</Tag> },
    { title: '状态', dataIndex: 'status', render: statusTag },
    {
      title: '操作',
      render: (_, row) => (
        <Space size="small">
          {row.status !== 'active' && (
            <Button size="small" onClick={() => handleStatus(row.id, 'active')}>
              解封
            </Button>
          )}
          {row.status !== 'banned' && row.role !== 'admin' && (
            <Button size="small" danger onClick={() => handleStatus(row.id, 'banned')}>
              封禁
            </Button>
          )}
          {row.status !== 'locked' && row.role !== 'admin' && (
            <Button size="small" onClick={() => handleStatus(row.id, 'locked')}>
              锁定
            </Button>
          )}
        </Space>
      ),
    },
  ]

  async function handleStatus(id, status) {
    try {
      await updateStatus({ id, status }).unwrap()
      message.success('已更新用户状态')
    } catch (err) {
      message.error(err?.data?.error?.message || '操作失败')
    }
  }

  async function handleDeleteReview(id) {
    try {
      await deleteReview(id).unwrap()
      message.success('已删除评论')
    } catch (err) {
      message.error(err?.data?.error?.message || '删除失败')
    }
  }

  const reviewColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户', dataIndex: 'username', width: 100 },
    { title: '电影', dataIndex: 'movieTitle', ellipsis: true },
    { title: '评分', dataIndex: 'rating', width: 70 },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: '时间', dataIndex: 'date', width: 170 },
    {
      title: '操作',
      width: 90,
      render: (_, row) => (
        <Popconfirm title="删除此评论？" onConfirm={() => handleDeleteReview(row.id)}>
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const auditColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    { title: '管理员', dataIndex: 'admin_username', width: 100 },
    { title: '动作', dataIndex: 'action' },
    { title: '目标', render: (_, r) => `${r.target_type || '-'} #${r.target_id || '-'}` },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>运营控制台</Title>
      <Text type="secondary">社区 B 面：用户封禁、评论审核、操作审计</Text>
      <Tabs
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'users',
            label: '用户管理',
            children: (
              <Table
                rowKey="id"
                loading={usersLoading}
                dataSource={usersData?.users || []}
                columns={userColumns}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 800 }}
              />
            ),
          },
          {
            key: 'reviews',
            label: '评论审核',
            children: (
              <Table
                rowKey="id"
                loading={reviewsLoading}
                dataSource={reviewsData?.reviews || []}
                columns={reviewColumns}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 900 }}
              />
            ),
          },
          {
            key: 'audit',
            label: '审计日志',
            children: (
              <Table
                rowKey="id"
                loading={auditLoading}
                dataSource={auditData?.logs || []}
                columns={auditColumns}
                pagination={{ pageSize: 10 }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

export default function AdminPage() {
  return (
    <NeedAuth>
      <AdminContent />
    </NeedAuth>
  )
}
