import { Row, Col, Card, Button, Empty, message } from 'antd';
import { confirmDanger } from '@/utils/confirmDialog';
import { HeartFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useDelFavoriteMutation } from '@/store/API/favoriteApi';
import { useFavorites } from '@/hooks/useFavorites';

const { Meta } = Card;

function Profile() {
  // 收藏列表已由后端联表返回电影信息(title/poster/rating/...)，无需再拉整表 join
  const { favorites: favoriteArray, isLoading } = useFavorites();
  const [delFavorite] = useDelFavoriteMutation();

  const handleRemove = async (movieId, movieTitle) => {
    const favoriteItem = favoriteArray.find(item => item.movieId === movieId);
    if (!favoriteItem) return;
    try {
      await confirmDanger({
        title: '取消收藏？',
        content: movieTitle ? `确定将《${movieTitle}》从收藏中移除吗？` : '确定取消收藏这部电影吗？',
      });
      await delFavorite(favoriteItem.documentId).unwrap();
      message.success('已取消收藏');
    } catch (error) {
      if (error?.message === 'cancelled') return;
      console.error('删除收藏失败:', error);
      message.error('取消收藏失败');
    }
  };

  if (isLoading) {
    return <div style={{ padding: 50, textAlign: 'center' }}>加载中...</div>
  }

  if (favoriteArray.length === 0) {
    return (
      <div style={{ padding: 50, textAlign: 'center' }}>
        <Empty description="暂无收藏电影" />
        <Button type="primary" style={{ marginTop: 20 }}>
          <Link to="/">去发现电影</Link>
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>我的收藏</h1>
      <Row gutter={[16, 16]}>
        {favoriteArray.map(movie => (
          <Col key={movie.documentId} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              cover={
                <img
                  alt={movie.title}
                  src={movie.poster}
                  loading="lazy"
                  style={{ height: '300px', objectFit: 'cover' }}
                  onError={(e) => {
                    if (e.currentTarget.dataset.fallbackApplied) return
                    e.currentTarget.dataset.fallbackApplied = '1'
                    e.currentTarget.src = '/no-image.png'
                  }}
                />
              }
              actions={[
                <Button
                  type="text"
                  danger
                  icon={<HeartFilled />}
                  onClick={() => handleRemove(movie.documentId, movie.title)}
                >
                  取消收藏
                </Button>
              ]}
            >
              <Link to={`/movie/${movie.documentId}`}>
                <Meta title={movie.title} description={`评分：${movie.rating}`} />
              </Link>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default Profile;