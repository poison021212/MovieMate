import React from 'react'
import { Button } from 'antd'
import { Routes, Route } from 'react-router-dom'
import MoviePage from '@/pages/MoviePage'
import MovieDetail from '@/pages/MovieDetailsPage'
import ProfilePage from '@/pages/ProfilePage'
import Layout from '@/components/Layout'
import AuthFormPage from '@/pages/AuthFormPage'
import useAutoLogout from '@/hooks/useAutoLogout'
import ProfileReviewPage from '@/pages/ProfileReviewPage'
import NeedAuth from '@/components/NeedAuth'

function App() {
  useAutoLogout()
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MoviePage />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/profile" element={<NeedAuth><ProfilePage /></NeedAuth>} />
        <Route path="/auth" element={<AuthFormPage />} />
        <Route path="/profile-review" element={<NeedAuth><ProfileReviewPage /></NeedAuth>} />
      </Routes>
    </Layout>
  )
}

export default App