import React from 'react'
import { Row, Col, Input } from 'antd'
import MovieCard from './MovieCard'
import { useGetMoviesQuery } from '@/store/API/MovieApi'
import { useState, useMemo, useCallback } from 'react'
import { debounce } from 'lodash'

const { Search } = Input;

const MovieList = () => {
  // const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const { data: movies, isSuccess, isLoading, error } = useGetMoviesQuery()
  // 使用 useMemo 缓存过滤后的结果，避免重复计算
  const filteredMovies = useMemo(() => {
    if (!movies) return [];
    if (!debouncedSearchTerm) return movies;
    return movies.filter(movie =>
      movie.title?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      movie.actors?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      movie.director?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [debouncedSearchTerm, movies]);
  // 使用 debounce 函数，将搜索操作延迟 500 毫秒执行
  const debounceSearch = useCallback(debounce((value) => {
    setDebouncedSearchTerm(value);
  }, 500), [debounce]);
  console.log(filteredMovies)
  const onSearch = (value, _e) => {
    _e.preventDefault()
    // setSearchTerm(value.trim())
    debounceSearch(value.trim())
    console.log(value)
  };
  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div style={{ color: 'red' }}>错误: {error.status}</div>
  }



  return (
    <div style={{ padding: 24 }}>
      <Search
        style={{ marginBottom: '.53rem' }}
        placeholder="请输入电影名称/导演/演员"
        onSearch={onSearch}
        onChange={(e) => debounceSearch(e.target.value)}//实时搜索
        enterButton
      />
      <Row gutter={[16, 16]}>
        {!isSuccess && <div>暂无电影数据</div>}
        {isSuccess && filteredMovies.map(movie => (
          <Col key={movie.documentId} xs={24} sm={12} md={8} lg={6}>
            <MovieCard movie={movie} />
          </Col>
        ))}
      </Row>
      {isSuccess && filteredMovies.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>未找到相关电影</div>
      )}
    </div>
  )
}

export default MovieList