// MovieSwipe.jsx — 速览：分页预加载 + 窗口渲染
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '@/CSS/MovieSwipe.module.css'
import { useGetMoviesQuery } from '@/store/API/MovieApi'
import { HeartOutlined, HeartFilled, MessageOutlined, SoundOutlined, PauseOutlined } from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { Modal, Input, Button, List, Avatar, Typography, Spin } from 'antd'
import { useAddFavoriteMutation, useDelFavoriteMutation } from '@/store/API/favoriteApi'
import { useGetReviewQuery, useAddReviewMutation } from '@/store/API/reviewApi'
import { speakText, stopSpeaking, isSpeechSupported } from '@/utils/speakText'
import { confirmDanger } from '@/utils/confirmDialog'
import { useFavorites } from '@/hooks/useFavorites'

const { Text, Paragraph } = Typography
const SWIPE_PAGE_SIZE = 10
const PRELOAD_THRESHOLD = 2

const posterFallback = (e) => {
  if (e.currentTarget.dataset.fallbackApplied) return
  e.currentTarget.dataset.fallbackApplied = '1'
  e.currentTarget.src = '/no-image.png'
}

const MovieSwipe = () => {
  const navigate = useNavigate()
  const [fetchPage, setFetchPage] = useState(1)
  const [movies, setMovies] = useState([])
  const [totalPages, setTotalPages] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [currentMovie, setCurrentMovie] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const mergingRef = useRef(false)

  const { data, isLoading, isFetching } = useGetMoviesQuery({
    page: fetchPage,
    pageSize: SWIPE_PAGE_SIZE,
    sortBy: 'id',
    sortOrder: 'asc',
  })

  const auth = useSelector((state) => state.auth)

  const { favorites } = useFavorites()
  const [addFavorite] = useAddFavoriteMutation()
  const [delFavorite] = useDelFavoriteMutation()

  // 评论按当前打开的电影筛选，由服务端过滤关键字
  const { data: reviews } = useGetReviewQuery(
    { movieId: currentMovie?.documentId },
    { skip: !currentMovie }
  )
  const [addReview] = useAddReviewMutation()

  useEffect(() => {
    if (!data?.items) return
    setTotalPages(data.pagination?.totalPages ?? 1)
    setMovies((prev) => {
      if (fetchPage === 1) return data.items
      const ids = new Set(prev.map((m) => m.documentId))
      const appended = data.items.filter((m) => !ids.has(m.documentId))
      return [...prev, ...appended]
    })
  }, [data, fetchPage])

  const loadNextPage = useCallback(() => {
    if (mergingRef.current || isFetching) return
    if (fetchPage >= totalPages) return
    mergingRef.current = true
    setFetchPage((p) => p + 1)
  }, [fetchPage, totalPages, isFetching])

  useEffect(() => {
    stopSpeaking()
    setSpeaking(false)
  }, [currentIndex])

  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  useEffect(() => {
    if (!isFetching) mergingRef.current = false
  }, [isFetching])

  useEffect(() => {
    if (movies.length === 0) return
    if (currentIndex >= movies.length - PRELOAD_THRESHOLD && fetchPage < totalPages) {
      loadNextPage()
    }
  }, [currentIndex, movies.length, fetchPage, totalPages, loadNextPage])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, movies.length - 1))
  }, [movies.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  useEffect(() => {
    const handleWheel = (e) => {
      if (showComments) return
      if (!movies.length) return
      if (e.deltaY > 0) goNext()
      else if (e.deltaY < 0) goPrev()
    }
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [showComments, movies.length, goNext, goPrev])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showComments) return
      if (!movies.length) return
      if (e.key === 'ArrowDown') goNext()
      else if (e.key === 'ArrowUp') goPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showComments, movies.length, goNext, goPrev])

  if (isLoading && movies.length === 0) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (movies.length === 0) {
    return <div style={{ padding: 50, textAlign: 'center' }}>暂无电影数据</div>
  }

  const isFavorited = (movieId) =>
    favorites.some((fav) => Number(fav.movieId) === Number(movieId))

  const getFavoriteItem = (movieId) =>
    favorites.find((fav) => Number(fav.movieId) === Number(movieId)) || null

  const handleFavorite = async (movie) => {
    if (!auth.isLogin) {
      alert('请先登录后再收藏')
      return
    }
    try {
      const favoriteItem = getFavoriteItem(movie.documentId)
      if (favoriteItem) {
        await confirmDanger({
          title: '取消收藏？',
          content: `确定将《${movie.title}》从收藏中移除吗？`,
        })
        await delFavorite(favoriteItem.id || favoriteItem.documentId)
      } else {
        await addFavorite({
          movieId: Number(movie.documentId),
        })
      }
    } catch (error) {
      if (error?.message === 'cancelled') return
      console.error('收藏操作失败:', error)
      alert('收藏操作失败，请重试')
    }
  }

  const handleShowComments = (movie) => {
    setCurrentMovie(movie)
    setShowComments(true)
    document.body.style.overflow = 'hidden'
  }

  const handleAddComment = async () => {
    if (!auth.isLogin) {
      alert('请先登录后再评论')
      return
    }
    if (!commentContent.trim()) {
      alert('请输入评论内容')
      return
    }
    try {
      await addReview({
        movieId: Number(currentMovie.documentId),
        content: commentContent,
        rating: 5,
      })
      setCommentContent('')
    } catch (error) {
      console.error('添加评论失败:', error)
      alert('添加评论失败，请重试')
    }
  }

  const getMovieReviews = () => (reviews?.data || [])

  const handleToggleSpeak = async (movie) => {
    if (!isSpeechSupported()) {
      alert('当前浏览器不支持语音播报')
      return
    }
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    const text = `${movie.title}。${movie.summary || '暂无简介'}`
    try {
      setSpeaking(true)
      await speakText(text)
    } catch (e) {
      console.error(e)
      alert('播报失败')
    } finally {
      setSpeaking(false)
    }
  }

  return (
    <div className={styles['swipe-container']}>
      {movies.map((movie, idx) => {
        if (Math.abs(idx - currentIndex) > 1) return null

        return (
          <div
            key={movie.documentId}
            className={`${styles['swipe-card']} ${idx === currentIndex ? styles['active'] : ''}`}
            style={{ transform: `translateY(${(idx - currentIndex) * 100}vh)` }}
          >
            <div className={styles['card-content']}>
              <img
                src={movie.poster}
                alt={movie.title}
                loading="lazy"
                draggable={false}
                onError={posterFallback}
              />
              <div className={styles['button-container']}>
                <h2 className={styles['title']}>{movie.title}</h2>
                <button
                  type="button"
                  onClick={() => navigate(`/movie/${movie.documentId}`)}
                >
                  查看详情
                </button>
              </div>

              <p className={styles['summary']}>{movie.summary}</p>

              <div className={styles['icons']}>
                <span
                  className={styles['icon-item']}
                  onClick={() => handleFavorite(movie)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleFavorite(movie)}
                >
                  {isFavorited(movie.documentId) ? (
                    <HeartFilled style={{ color: '#ff4d4f' }} />
                  ) : (
                    <HeartOutlined />
                  )}
                </span>
                <span
                  className={styles['icon-item']}
                  onClick={() => handleToggleSpeak(movie)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  title={speaking ? '停止播报' : '播报简介'}
                >
                  {speaking && idx === currentIndex ? <PauseOutlined /> : <SoundOutlined />}
                </span>
                <span
                  className={styles['icon-item']}
                  onClick={() => handleShowComments(movie)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleShowComments(movie)}
                >
                  <MessageOutlined />
                </span>
              </div>
            </div>
          </div>
        )
      })}

      {isFetching && fetchPage > 1 && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
          <Spin size="small" /> 加载更多...
        </div>
      )}

      <Modal
        title={`${currentMovie?.title ?? ''} - 评论`}
        open={showComments}
        onCancel={() => {
          setShowComments(false)
          document.body.style.overflow = ''
        }}
        footer={null}
        width={600}
      >
        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
          <List
            dataSource={getMovieReviews()}
            renderItem={(review) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar>{review.username?.[0] || 'U'}</Avatar>}
                  title={<Text>{review.username}</Text>}
                  description={
                    <div>
                      <Paragraph>{review.content}</Paragraph>
                      <Text type="secondary">{new Date(review.date).toLocaleString()}</Text>
                    </div>
                  }
                />
              </List.Item>
            )}
            locale={{ emptyText: '暂无评论' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Input
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
            placeholder="写下你的评论..."
            style={{ flex: 1 }}
          />
          <Button type="primary" onClick={handleAddComment}>
            发布
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default MovieSwipe
