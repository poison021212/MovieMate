// MovieSwipe.jsx
import { useState, useEffect } from 'react';
import styles from '@/CSS/MovieSwipe.module.css';
import { useGetMoviesQuery } from '@/store/API/MovieApi';
import { HeartOutlined, HeartFilled, MessageOutlined } from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { Modal, Input, Button, List, Avatar, Typography } from 'antd';
import { useAddFavoriteMutation, useDelFavoriteMutation, useGetFavoriteQuery } from '@/store/API/favoriteApi';
import { useGetReviewQuery, useAddReviewMutation } from '@/store/API/reviewApi';

const { Text, Paragraph } = Typography;

const MovieSwipe = () => {
  const { data: movies } = useGetMoviesQuery(); // 获取电影列表
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [currentMovie, setCurrentMovie] = useState(null);

  const auth = useSelector(state => state.auth);

  // 收藏相关
  const { data: favorites } = useGetFavoriteQuery();
  const [addFavorite] = useAddFavoriteMutation();
  const [delFavorite] = useDelFavoriteMutation();

  // 评论相关
  const { data: reviews, refetch } = useGetReviewQuery();
  const [addReview] = useAddReviewMutation();

  // 监听滚轮事件
  useEffect(() => {
    const handleWheel = (e) => {
      // 当评论弹窗打开时，不处理滚动
      if (showComments) return;

      // 确保 movies 存在且是数组
      if (!movies || !Array.isArray(movies)) return;
      // e.deltaY > 0 表示向下滑滚，e.deltaY < 0 表示向上滚滚
      if (e.deltaY > 0 && currentIndex < movies.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.deltaY < 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    };
    // 表示在组件挂载时添加事件监听器，组件卸载时移除事件监听器
    window.addEventListener('wheel', handleWheel);
    return () => window.removeEventListener('wheel', handleWheel);
  }, [currentIndex, movies, showComments]);

  // 监听键盘上下键
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 当评论弹窗打开时，不处理键盘事件
      if (showComments) return;

      // 确保 movies 存在且是数组
      if (!movies || !Array.isArray(movies)) return;
      if (e.key === 'ArrowDown' && currentIndex < movies.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, movies, showComments]);

  // 检查movies是否已加载完成
  if (!movies) {
    return <div>加载中...</div>;
  }

  // 检查电影是否已收藏
  const isFavorited = (movieId) => {
    const movieIdNum = Number(movieId);
    // 处理不同的数据结构
    if (Array.isArray(favorites)) {
      // 直接是收藏数组
      return favorites.some(fav => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username);
    } else if (favorites && Array.isArray(favorites.data)) {
      // 可能是 { data: [...] } 结构
      return favorites.data.some(fav => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username);
    }
    return false;
  };

  // 获取收藏项
  const getFavoriteItem = (movieId) => {
    const movieIdNum = Number(movieId);
    // 处理不同的数据结构
    if (Array.isArray(favorites)) {
      // 直接是收藏数组
      return favorites.find(fav => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username);
    } else if (favorites && Array.isArray(favorites.data)) {
      // 可能是 { data: [...] } 结构
      return favorites.data.find(fav => Number(fav.movieId) === movieIdNum && fav.username === auth.userInfo?.username);
    }
    return null;
  };

  // 处理收藏/取消收藏
  const handleFavorite = async (movie) => {
    if (!auth.isLogin) {
      alert('请先登录后再收藏');
      return;
    }

    try {
      const movieIdNum = Number(movie.documentId);
      const favoriteItem = getFavoriteItem(movie.documentId);

      if (favoriteItem) {
        // 取消收藏
        await delFavorite(favoriteItem.id || favoriteItem.documentId);
      } else {
        // 添加收藏 - API 已经在内部处理了 data 包装
        await addFavorite({
          movieId: movieIdNum,
          username: auth.userInfo?.username
        });
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      alert('收藏操作失败，请重试');
    }
  };

  // 处理显示评论
  const handleShowComments = (movie) => {
    setCurrentMovie(movie);
    setShowComments(true);
    // 禁用页面滚动
    document.body.style.overflow = 'hidden';
  };

  // 处理添加评论
  const handleAddComment = async () => {
    if (!auth.isLogin) {
      alert('请先登录后再评论');
      return;
    }

    if (!commentContent.trim()) {
      alert('请输入评论内容');
      return;
    }

    try {
      const movieIdNum = Number(currentMovie.documentId);
      // 添加评论 - 需要手动包装 data，并添加 date 字段
      await addReview({
        data: {
          movieId: movieIdNum,
          content: commentContent,
          // 必须包含评分 字段
          rating: 5, // 默认评分
          date: new Date().toISOString()
        }
      });
      setCommentContent('');
      // 评论成功后刷新评论列表
      // 刷新评论列表，显示新提交的评论
      refetch()
    } catch (error) {
      console.error('添加评论失败:', error);
      alert('添加评论失败，请重试');
    }
  };

  // 获取电影的评论
  const getMovieReviews = (movieId) => {
    const movieIdNum = Number(movieId);
    // 处理不同的数据结构
    if (Array.isArray(reviews)) {
      // 直接是评论数组
      return reviews.filter(review => Number(review.movieId) === movieIdNum);
    } else if (reviews && Array.isArray(reviews.data)) {
      // 可能是 { data: [...] } 结构
      return reviews.data.filter(review => Number(review.movieId) === movieIdNum);
    }
    return [];
  };

  return (
    <div className={styles['swipe-container']}>
      {movies.map((movie, idx) => (
        <div
          key={movie.documentId}
          className={`${styles['swipe-card']} ${idx === currentIndex ? styles['active'] : ''}`}
          style={{ transform: `translateY(${(idx - currentIndex) * 100}vh)` }}
        >
          <div className={styles['card-content']}>
            <img src={movie.poster} alt={movie.title} />
            <div className={styles['button-container']}>
              <h2 className={styles['title']}>{movie.title}</h2>
              <button onClick={() => window.location.href = `/movie/${movie.documentId}`}>
                查看详情
              </button>
            </div>

            <p className={styles['summary']}>{movie.summary}</p>

            <div className={styles['icons']}>
              <span
                className={styles['icon-item']}
                onClick={() => handleFavorite(movie)}
                style={{ cursor: 'pointer' }}
              >
                {isFavorited(movie.documentId) ?
                  <HeartFilled style={{ color: '#ff4d4f' }} /> :
                  <HeartOutlined />}
              </span>
              <span
                className={styles['icon-item']}
                onClick={() => handleShowComments(movie)}
                style={{ cursor: 'pointer' }}
              >
                <MessageOutlined />
              </span>
            </div>
          </div>

        </div>
      ))}

      {/* 评论弹窗 */}
      <Modal
        title={currentMovie?.title + ' - 评论'}
        open={showComments}
        onCancel={() => {
          setShowComments(false);
          // 恢复页面滚动
          document.body.style.overflow = '';
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
};

export default MovieSwipe;