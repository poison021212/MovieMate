import React from 'react'
import { Card } from 'antd'
import { useNavigate } from 'react-router-dom'

const { Meta } = Card

const MovieCard = ({ movie }) => {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate(`/movie/${movie.documentId}`, { replace: false })
  }

  return (
    <Card
      hoverable
      style={{ width: '100%' }}
      cover={
        <img
          draggable={false}
          loading="lazy"
          alt={movie.title}
          src={movie.poster}
          onError={(e) => {
            if (e.currentTarget.dataset.fallbackApplied) return
            e.currentTarget.dataset.fallbackApplied = '1'
            e.currentTarget.src = '/no-image.png'
          }}
          style={{ height: '300px', objectFit: 'cover' }}
        />
      }
      onClick={handleClick}
      bodyStyle={{ cursor: 'pointer' }}
    >
      <Meta title={movie.title} description={`评分: ${movie.rating}`} />
    </Card>
  )
}

export default MovieCard