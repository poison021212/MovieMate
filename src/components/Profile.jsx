import { Row, Col, Card, Button, Empty } from 'antd';
import { HeartFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useGetMoviesQuery } from '@/store/API/MovieApi';
import { useGetFavoriteQuery, useDelFavoriteMutation } from '@/store/API/favoriteApi';
import { useSelector } from 'react-redux';

const { Meta } = Card;

function Profile() {
  const { data: movies, } = useGetMoviesQuery();
  const { data: favorite, refetch } = useGetFavoriteQuery();
  const [delFavorite] = useDelFavoriteMutation();
  const auth = useSelector(state => state.auth);

  // 从所有电影中筛选出收藏的电影
  // console.log('收藏数据:', favorite);
  // console.log('电影数据:', movies);
  // console.log('当前用户:', auth.userInfo);
  // 筛选当前用户的收藏
  const favoriteArray = Array.isArray(favorite?.data) ? favorite.data.filter(item => item.username === auth.userInfo?.username) : [];
  // 处理 movies 是数组的情况（因为 MovieApi 的 transformResponse 直接返回了数组）
  const moviesArray = Array.isArray(movies) ? movies : Array.isArray(movies?.data) ? movies.data : [];
  // console.log('收藏数组:', favoriteArray);
  // console.log('电影数组:', moviesArray);
  const favoriteMovies = moviesArray.filter(movie =>
    favoriteArray.some(favoriteItem => favoriteItem.movieId === movie.documentId)
  );
  // console.log('已收藏', favoriteMovies)
  const handleRemove = async (movieId) => {
    // 找到对应的收藏记录
    const favoriteItem = favoriteArray.find(item => item.movieId === movieId);
    if (favoriteItem) {
      try {
        await delFavorite(favoriteItem.documentId).unwrap();
        // 删除成功后，刷新收藏列表
        refetch();
      } catch (error) {
        console.error('删除收藏失败:', error);
      }
    }
  };

  if (favoriteMovies.length === 0) {
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
        {favoriteMovies.map(movie => (
          <Col key={movie.documentId} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              cover={<img alt={movie.title} src={movie.poster} style={{ height: '300px', objectFit: 'cover' }} />}
              actions={[
                <Button
                  type="text"
                  danger
                  icon={<HeartFilled />}
                  onClick={() => handleRemove(movie.documentId)}
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