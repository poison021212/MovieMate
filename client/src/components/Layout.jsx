import React from 'react'
import { Layout as AntLayout, Menu, Dropdown, Space, Modal } from 'antd';
import { HomeOutlined, HeartOutlined, UserOutlined, LogoutOutlined, MessageOutlined, DownOutlined, OpenAIOutlined, SwapOutlined, BarChartOutlined, SettingOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '@/store/Slice/authSlice';
import { useLogoutMutation } from '@/store/API/authApi';
import { isStaff } from '@/utils/roles';

const { Header, Content } = AntLayout;

// path 前缀 → 高亮菜单项；更具体的前缀需排在前面(否则 /profile-review 会被 /profile 抢先命中)
const SELECTED_BY_PREFIX = [
  ['/profile-review', 'profile-review'],
  ['/profile', 'profile'],
  ['/ai-recommend', 'ai-recommend'],
  ['/dashboard', 'dashboard'],
  ['/admin', 'admin'],
  ['/swipe', 'swipe'],
  ['/auth', 'auth'],
  ['/', 'home'],
]

const Layout = (props) => {
  const auth = useSelector(state => state.auth)
  const dispatch = useDispatch()
  const location = useLocation()
  const [logoutApi] = useLogoutMutation()

  const selectedKey = SELECTED_BY_PREFIX.find(([prefix]) => location.pathname.startsWith(prefix))?.[1]

  const profileDropdownItems = [{
    key: 'profile',
    icon: <HeartOutlined />,
    label: <Link to="/profile">我的收藏</Link>,
  },
  {
    type: 'divider',
  },
  {
    key: 'profile-review',
    icon: <MessageOutlined />,
    label: <Link to="/profile-review">我的评论</Link>
  },
  ...(isStaff(auth.userInfo?.role)
    ? [
        { type: 'divider' },
        {
          key: 'admin',
          icon: <SettingOutlined />,
          label: <Link to="/admin">运营台</Link>,
        },
      ]
    : [])]
  const logoutConfirm = () => {
    Modal.confirm({
      title: "确认退出",
      content: "退出后需要重新登录",
      cancelText: "取消",
      okText: "确定",
      onOk: async () => {
        try {
          if (auth.isLogin) {
            await logoutApi({}).unwrap()
          }
        } catch {
          /* still clear local session */
        }
        dispatch(logout())
      }
    })
  }

  const navItems = [
    { key: 'home', icon: <HomeOutlined />, label: <Link to="/">首页</Link> },
    { key: 'swipe', icon: <SwapOutlined />, label: <Link to="/swipe">速览模式</Link> },
    { key: 'ai-recommend', icon: <OpenAIOutlined />, label: <Link to="/ai-recommend">AI推荐</Link> },
    { key: 'dashboard', icon: <BarChartOutlined />, label: <Link to="/dashboard">数据洞察</Link> },
    ...(auth.isLogin && isStaff(auth.userInfo?.role)
      ? [{ key: 'admin', icon: <SettingOutlined />, label: <Link to="/admin">运营台</Link> }]
      : []),
    ...(!auth.isLogin
      ? [{
          key: 'auth',
          icon: <UserOutlined />,
          style: { marginLeft: 'auto' },
          label: <Link to="/auth" state={{ from: location }}>登录/注册</Link>,
        }]
      : [
          {
            key: 'profile',
            label: (
              <Dropdown menu={{ items: profileDropdownItems }} trigger={['click']}>
                <span style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <Space>
                    我的
                    <DownOutlined />
                  </Space>
                </span>
              </Dropdown>
            ),
          },
          {
            key: 'auth',
            icon: <UserOutlined />,
            style: { marginLeft: 'auto' },
            label: <Link to="/profile">{auth.userInfo?.username || '个人中心'}</Link>,
          },
          { key: 'logout', icon: <LogoutOutlined />, onClick: logoutConfirm, label: '退出' },
        ]),
  ]

  return (
    <AntLayout>
      {/* flexWrap: 'wrap', gap: 8允许换行；minWidth: 0 防止溢出 */}
      {/*  fontSize: 'clamp(14px, 3vw, 20px)'响应式字体*/}
      <Header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, }}>
        <div style={{ color: 'white', fontSize: 20, marginRight: 40, whiteSpace: 'nowrap' }}>光影笔记</div>
        <Menu theme="dark" mode="horizontal" selectedKeys={selectedKey ? [selectedKey] : []} items={navItems} style={{ flex: 1, minWidth: 0 }} />
      </Header>
      <Content style={{ minHeight: '100vh', paddingTop: 55 }}>
        {props.children}
      </Content>
    </AntLayout>
  )
}

export default Layout