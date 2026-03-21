import React from 'react'
import { Layout as AntLayout, Menu, Dropdown, Space, Modal } from 'antd';
import { HomeOutlined, HeartOutlined, UserOutlined, LogoutOutlined, MessageOutlined, DownOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { logout } from '@/store/Slice/authSlice';

const { Header, Content } = AntLayout;

const Layout = (props) => {
  const auth = useSelector(state => state.auth)
  const dispatch = useDispatch()
  const location = useLocation()
  const getSelectedKey = () => {
    const path = location.pathname
    if (path === '/') return 'home'
    if (path === '/profile') return 'profile'
    if (path === '/profile-review') return 'profile-review'
    if (path === '/auth') return 'auth'
    if (path === '/movie/:id') return 'movie/:id'
  }
  const items = [{
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
  }]
  const logoutConfirm = () => {
    Modal.confirm({
      title: "确认退出",
      content: "退出后需要重新登录",
      cancelText: "取消",
      okText: "确定",
      onOk: () => { dispatch(logout()) }
    })
  }

  return (
    <AntLayout>
      {/* flexWrap: 'wrap', gap: 8允许换行；minWidth: 0 防止溢出 */}
      {/*  fontSize: 'clamp(14px, 3vw, 20px)'响应式字体*/}
      <Header style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'white', fontSize: 20, marginRight: 40, whiteSpace: 'nowrap' }}>光影笔记</div>
        <Menu theme="dark" mode="horizontal" defaultSelectedKeys={[getSelectedKey()]} style={{ flex: 1, minWidth: 0 }}>
          <Menu.Item key="home" icon={<HomeOutlined />}>
            <Link to="/">首页</Link>
          </Menu.Item>
          {!auth.isLogin && (
            <Menu.Item key="auth" icon={<UserOutlined />} style={{ marginLeft: 'auto' }}>
              <Link to="/auth">登录/注册</Link>
            </Menu.Item>
          )}
          {auth.isLogin &&
            <>
              <Menu.Item key="profile" >
                <Dropdown menu={{ items }} trigger={['click']}>
                  <span style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <Space>
                      我的
                      <DownOutlined />
                    </Space>
                  </span>
                </Dropdown>
              </Menu.Item>
              <Menu.Item key="auth" icon={<UserOutlined />} style={{ marginLeft: 'auto' }}>
                <Link to="/profile">{auth.userInfo?.username || '个人中心'}</Link>
              </Menu.Item>
              <Menu.Item key="logout" icon={<LogoutOutlined />} >
                <Link to="/" onClick={logoutConfirm}>退出</Link>
              </Menu.Item>
            </>}
        </Menu>
      </Header>
      <Content style={{ minHeight: 'calc(100vh - 64px)' }}>
        {props.children}
      </Content>
    </AntLayout>
  )
}

export default Layout