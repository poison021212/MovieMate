// MovieSwipe.jsx — 速览：分页预加载 + 窗口渲染
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from '@/CSS/MovieSwipe.module.css'
import { useGetMoviesQuery } from '@/store/API/MovieApi'
import { HeartOutlined, HeartFilled, MessageOutlined } from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { Modal, Input, Button, List, Avatar, Typography, Spin } from 'antd'
import { useAddFavoriteMutation, useDelFavoriteMutation, useGetFavoriteQuery } from '@/store/API/favoriteApi'
import { useGetReviewQuery, useAddReviewMutation } from '@/store/API/reviewApi'

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
  const mergingRef = useRef(false)

  const { data, isLoading, isFetching } = useGetMoviesQuery({
    page: fetchPage,
    pageSize: SWIPE_PAGE_SIZE,
    sortBy: 'id',
    sortOrder: 'asc',
  })

  const auth = useSelector((state) => state.auth)

  const { data: favorites } = useGetFavoriteQuery(undefined, { skip: !auth.isLogin })
  const [addFavorite] = useAddFavoriteMutation()
  const [delFavorite] = useDelFavoriteMutation()

  const { data: reviews, refetch } = useGetReviewQuery()
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

  const isFavorited = (movieId) => {
    const movieIdNum = Number(movieId)
    if (Array.isArray(favorites)) {
      return favorites.some(
        (fav) => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username
      )
    }
    if (favorites && Array.isArray(favorites.data)) {
      return favorites.data.some(
        (fav) => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username
      )
    }
    return false
  }

  const getFavoriteItem = (movieId) => {
    const movieIdNum = Number(movieId)
    if (Array.isArray(favorites)) {
      return favorites.find(
        (fav) => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username
      )
    }
    if (favorites && Array.isArray(favorites.data)) {
      return favorites.data.find(
        (fav) => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username
      )
    }
    return null
  }

  const handleFavorite = async (movie) => {
    if (!auth.isLogin) {
      alert('请先登录后再收藏')
      return
    }
    try {
      const favoriteItem = getFavoriteItem(movie.documentId)
      if (favoriteItem) {
        await delFavorite(favoriteItem.id || favoriteItem.documentId)
      } else {
        await addFavorite({
          movieId: Number(movie.documentId),
          username: auth.userInfo?.username,
        })
      }
    } catch (error) {
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
        data: {
          movieId: Number(currentMovie.documentId),
          content: commentContent,
          rating: 5,
          date: new Date().toISOString(),
        },
      })
      setCommentContent('')
      refetch()
    } catch (error) {
      console.error('添加评论失败:', error)
      alert('添加评论失败，请重试')
    }
  }

  const getMovieReviews = (movieId) => {
    const movieIdNum = Number(movieId)
    if (Array.isArray(reviews)) {
      return reviews.filter((review) => Number(review.movieId) === movieIdNum)
    }
    if (reviews && Array.isArray(reviews.data)) {
      return reviews.data.filter((review) => Number(review.movieId) === movieIdNum)
    }
    return []
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
            dataSource={getMovieReviews(currentMovie?.documentId)}
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
