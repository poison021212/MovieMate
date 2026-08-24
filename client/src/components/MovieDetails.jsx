import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Row, Col, Image, Descriptions, Divider, Button, Space, Typography, message } from 'antd';
import { confirmDanger } from '@/utils/confirmDialog';
import { HeartOutlined, HeartFilled, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { useGetMoviesByIdQuery } from '@/store/API/MovieApi';
import { useSelector } from 'react-redux';
import ReviewsForm from './ReviewsForm';
import { useAddFavoriteMutation, useDelFavoriteMutation } from '@/store/API/favoriteApi';
import { useFavorites } from '@/hooks/useFavorites';

const { Text } = Typography;

function MovieDetail() {
  const { id } = useParams(); // 获取 URL 中的 id 参数
  const auth = useSelector(state => state.auth)
  const { data: movie, isLoading, isError } = useGetMoviesByIdQuery(id); // 传递 id 参数
  const { favorites } = useFavorites()
  const [delFavorite] = useDelFavoriteMutation()
  const [addFavorite] = useAddFavoriteMutation()
  const [showFullCast, setShowFullCast] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#movie-review') {
      const el = document.getElementById('movie-review');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, movie?.id]);

  if (isLoading) {
    return <div style={{ padding: 50, textAlign: 'center' }}>加载中...</div>;
  }

  if (isError || !movie) {
    return <div style={{ padding: 50, textAlign: 'center' }}>电影不存在</div>;
  }

  // 收藏列表已由后端按当前用户过滤；id 为字符串需转数字比较
  const movieIdNum = Number(id);
  const favoriteItem = favorites.find(item => Number(item.movieId) === movieIdNum);
  const isFavorite = !!favoriteItem;

  const handleToggleFavorite = async () => {
    if (!auth.isLogin) {
      message.error('请先登录后再收藏')
      navigate('/auth', { state: { from: location } });
      return;
    }

    try {
      if (isFavorite) {
        await confirmDanger({
          title: '取消收藏？',
          content: `确定将《${movie.title}》从收藏中移除吗？`,
        })
        if (favoriteItem) {
          await delFavorite(favoriteItem.documentId).unwrap();
          message.success('已取消收藏');
        }
      } else {
        // 添加收藏（username 由后端从登录态取值）
        await addFavorite({ movieId: Number(id) }).unwrap();
      }
    } catch (error) {
      if (error?.message === 'cancelled') return
      console.error('操作收藏失败:', error);
      message.error('收藏操作失败');
    }
  };

  // 处理演员列表的显示逻辑
  const castText = movie.actors || '未知';
  const maxCastLength = 20; // 最大显示长度
  const shouldShowMore = castText.length > maxCastLength;
  const displayCast = shouldShowMore && !showFullCast ? `${castText.substring(0, maxCastLength)}...` : castText;

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[24, 24]}>
        {/* 海报 */}
        <Col xs={24} md={8}>
          <Image
            src={movie.poster}
            alt={movie.title}
            fallback="/no-image.png"
            preview={false}
            style={{ width: '100%', borderRadius: 8 }}
          />
        </Col>

        {/* 详情信息 */}
        <Col xs={24} md={16}>
          <h1>{movie.title}</h1>
          <Descriptions column={{ xs: 1, md: 2 }} bordered>
            <Descriptions.Item label="导演">{movie.director || '未知'}</Descriptions.Item>
            <Descriptions.Item label="主演">
              <div>
                <Text>{displayCast}</Text>
                {shouldShowMore && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setShowFullCast(!showFullCast)}
                    icon={showFullCast ? <UpOutlined /> : <DownOutlined />}
                  >
                    {showFullCast ? '收起' : '更多'}
                  </Button>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="类型">{movie.genre || '未知'}</Descriptions.Item>
            <Descriptions.Item label="片长">{movie.duration || '未知'}</Descriptions.Item>
            <Descriptions.Item label="年份">{movie.year || '未知'}</Descriptions.Item>
            <Descriptions.Item label="评分">⭐ {movie.rating || 0}</Descriptions.Item>
          </Descriptions>

          <Divider />

          <p><strong>剧情简介：</strong>{movie.summary || '暂无简介'}</p>

          <Divider />

          <Space>
            <Button
              type={(auth.isLogin && isFavorite) ? 'primary' : 'default'}
              icon={(auth.isLogin && isFavorite) ? <HeartFilled /> : <HeartOutlined />}
              onClick={handleToggleFavorite}
            >
              {(auth.isLogin && isFavorite) ? '已收藏' : '收藏'}
            </Button>
          </Space>

        </Col>
        <Col xs={24} md={24} id="movie-review">
          <ReviewsForm />
        </Col>

      </Row>


    </div>
  );
}

export default MovieDetail;