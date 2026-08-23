import React from 'react'
import { Card, Table, Tag, Button, Space, Tabs, Typography, message, Popconfirm, Select } from 'antd'
import {
  useGetAdminMeQuery,
  useListAdminUsersQuery,
  useUpdateUserStatusMutation,
  useUpdateUserRoleMutation,
  useListAdminReviewsQuery,
  useDeleteAdminReviewMutation,
  useListAdminAuditQuery,
} from '@/store/API/adminApi'
import NeedAuth from '@/components/NeedAuth'
import { isStaff, ROLE_LABELS, STAFF_ROLES } from '@/utils/roles'

const { Title, Text } = Typography

const ALL_ROLES = ['user', ...STAFF_ROLES]

function AdminContent() {
  const { data: meData, error: meError, isLoading: meLoading } = useGetAdminMeQuery()
  const permissions = meData?.admin?.permissions || {}
  const canManageUsers = Boolean(permissions['users.manage'])
  const canChangeRole = Boolean(permissions['users.role'])
  const canModerateReviews = Boolean(permissions['reviews.moderate'])
  const canReadAudit = Boolean(permissions['audit.read'])
  const myRole = meData?.admin?.role
  const myUsername = meData?.admin?.username

  const { data: usersData, isLoading: usersLoading } = useListAdminUsersQuery(undefined, {
    skip: !canManageUsers,
  })
  const { data: reviewsData, isLoading: reviewsLoading } = useListAdminReviewsQuery(undefined, {
    skip: !canModerateReviews,
  })
  const { data: auditData, isLoading: auditLoading } = useListAdminAuditQuery(undefined, {
    skip: !canReadAudit,
  })
  const [updateStatus] = useUpdateUserStatusMutation()
  const [updateRole] = useUpdateUserRoleMutation()
  const [deleteReview] = useDeleteAdminReviewMutation()

  if (meLoading) return <Card loading />
  if (meError || !meData?.admin || !isStaff(myRole)) {
    return (
      <Card>
        <Title level={4}>无权限</Title>
        <Text type="secondary">需要运营后台角色（moderator / operator / admin）。</Text>
      </Card>
    )
  }

  const statusTag = (status) => {
    const map = { active: 'green', locked: 'orange', banned: 'red' }
    return <Tag color={map[status] || 'default'}>{status}</Tag>
  }

  function canModifyStatus(row) {
    if (!canManageUsers) return false
    if (row.username === myUsername) return false
    if (myRole === 'operator' && isStaff(row.role)) return false
    return true
  }

  async function handleStatus(id, status) {
    try {
      await updateStatus({ id, status }).unwrap()
      message.success('已更新用户状态')
    } catch (err) {
      message.error(err?.data?.error?.message || err?.data?.message || '操作失败')
    }
  }

  async function handleRoleChange(id, role) {
    try {
      await updateRole({ id, role }).unwrap()
      message.success('已更新用户角色')
    } catch (err) {
      message.error(err?.data?.error?.message || err?.data?.message || '操作失败')
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

  const userColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email', ellipsis: true },
    {
      title: '角色',
      dataIndex: 'role',
      render: (role, row) =>
        canChangeRole && row.username !== myUsername ? (
          <Select
            size="small"
            value={role}
            style={{ width: 120 }}
            options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] || r }))}
            onChange={(value) => handleRoleChange(row.id, value)}
          />
        ) : (
          <Tag>{ROLE_LABELS[role] || role}</Tag>
        ),
    },
    { title: '状态', dataIndex: 'status', render: statusTag },
    {
      title: '操作',
      render: (_, row) => {
        if (!canModifyStatus(row)) return '—'
        return (
          <Space size="small">
            {row.status !== 'active' && (
              <Button size="small" onClick={() => handleStatus(row.id, 'active')}>
                解封
              </Button>
            )}
            {row.status !== 'banned' && (
              <Button size="small" danger onClick={() => handleStatus(row.id, 'banned')}>
                封禁
              </Button>
            )}
            {row.status !== 'locked' && (
              <Button size="small" onClick={() => handleStatus(row.id, 'locked')}>
                锁定
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

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

  const tabItems = [
    canManageUsers && {
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
    canModerateReviews && {
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
    canReadAudit && {
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
  ].filter(Boolean)

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>运营控制台</Title>
      <Text type="secondary">
        当前角色：{ROLE_LABELS[myRole] || myRole} · 社区 B 面：用户封禁、评论审核、操作审计
      </Text>
      <Tabs style={{ marginTop: 24 }} items={tabItems} />
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
