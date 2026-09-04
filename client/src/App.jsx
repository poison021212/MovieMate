import React from 'react'
import { App as AntdApp } from 'antd'
import { Routes, Route } from 'react-router-dom'
import ScrollToTopOnRouteChange from '@/components/ScrollToTopOnRouteChange'
import MoviePage from '@/pages/MoviePage'
import MovieDetail from '@/pages/MovieDetailsPage'
import ProfilePage from '@/pages/ProfilePage'
import Layout from '@/components/Layout'
import AuthFormPage from '@/pages/AuthFormPage'
import VerifyEmailPage from '@/pages/VerifyEmailPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import useAutoLogout from '@/hooks/useAutoLogout'
import useSessionBootstrap from '@/hooks/useSessionBootstrap'
import ProfileReviewPage from '@/pages/ProfileReviewPage'
import NeedAuth from '@/components/NeedAuth'
import AIRecommend from '@/components/AIRecommend'
import MovieSwipePage from '@/pages/MovieSwipePage'
import DashboardPage from '@/pages/DashboardPage'
import AdminPage from '@/pages/AdminPage'

function App() {
  useSessionBootstrap()
  useAutoLogout()
  return (
    <AntdApp>
      <ScrollToTopOnRouteChange />
      <Layout>
        <Routes>
          <Route path="/" element={<MoviePage />} />
          <Route path="/swipe" element={<MovieSwipePage />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/profile" element={<NeedAuth><ProfilePage /></NeedAuth>} />
          <Route path="/auth" element={<AuthFormPage />} />
          <Route path="/auth/verify" element={<VerifyEmailPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/profile-review" element={<NeedAuth><ProfileReviewPage /></NeedAuth>} />
          <Route path="/ai-recommend" element={<AIRecommend />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Layout>
    </AntdApp>
  )
}

export default App