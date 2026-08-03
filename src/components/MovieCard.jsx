import React from 'react';
import { Card } from 'antd';
import { replace, useNavigate } from 'react-router-dom';

const { Meta } = Card;
// {movie}=props.movie从props中解构出movie对象
const MovieCard = ({ movie }) => {
  {/* <Link to=`/movie/${movie.documentId}`><Card></Card></Link> */ }


  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/movie/${movie.documentId}`, { replace: false });
  };

  return (
    <Card
      hoverable
      style={{ width: '100%' }}
      cover={
        <img
          // 防止图片拖动
          draggable={false}
          alt={movie.title}
          src={movie.poster}
          style={{ height: '300px', objectFit: 'cover' }}
        />
      }
      onClick={handleClick}
      bodyStyle={{ cursor: 'pointer' }}
    >
      <Meta title={movie.title} description={`评分: ${movie.rating}`} />
    </Card>
  );
};
export default MovieCard;