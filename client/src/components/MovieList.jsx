import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Row, Col, Input, Pagination, Select, Space, Button, InputNumber, Alert } from 'antd'
import MovieCard from './MovieCard'
import { useGetMoviesQuery } from '@/store/API/MovieApi'

const { Search } = Input

const GENRE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: '剧情', label: '剧情' },
  { value: '科幻', label: '科幻' },
  { value: '悬疑', label: '悬疑' },
  { value: '动作', label: '动作' },
  { value: '动画', label: '动画' },
  { value: '喜剧', label: '喜剧' },
]

const DEFAULT_PAGE_SIZE = 12

function parseStateFromSearchParams(sp) {
  const page = Math.max(parseInt(sp.get('page') || '1', 10), 1)
  const pageSize = Math.max(parseInt(sp.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10), 1)
  const q = sp.get('q') || ''
  const sortBy = sp.get('sortBy') || 'id'
  const sortOrder = sp.get('sortOrder') || 'asc'
  const minRatingRaw = sp.get('minRating')
  const minRating =
    minRatingRaw !== null && minRatingRaw !== '' ? Number(minRatingRaw) : null
  const year = sp.get('year') || ''
  const genre = sp.get('genre') || ''
  return { page, pageSize, q, sortBy, sortOrder, minRating, year, genre }
}

function buildSearchParams(state) {
  const next = new URLSearchParams()
  if (state.page > 1) next.set('page', String(state.page))
  if (state.pageSize !== DEFAULT_PAGE_SIZE) next.set('pageSize', String(state.pageSize))
  if (state.q) next.set('q', state.q)
  if (state.sortBy !== 'id') next.set('sortBy', state.sortBy)
  if (state.sortOrder !== 'asc') next.set('sortOrder', state.sortOrder)
  if (state.minRating != null && !Number.isNaN(state.minRating)) {
    next.set('minRating', String(state.minRating))
  }
  if (state.year) next.set('year', state.year)
  if (state.genre) next.set('genre', state.genre)
  return next
}

const MovieList = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = parseStateFromSearchParams(searchParams)

  const [page, setPage] = useState(initial.page)
  const [pageSize, setPageSize] = useState(initial.pageSize)

  const [inputValue, setInputValue] = useState(initial.q)
  const [searchTerm, setSearchTerm] = useState(initial.q)

  const [sortBy, setSortBy] = useState(initial.sortBy)
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)

  const [minRating, setMinRating] = useState(initial.minRating)
  const [year, setYear] = useState(initial.year)
  const [genre, setGenre] = useState(initial.genre)

  const syncUrl = useCallback(
    (patch) => {
      const state = {
        page,
        pageSize,
        q: searchTerm,
        sortBy,
        sortOrder,
        minRating,
        year,
        genre,
        ...patch,
      }
      const next = buildSearchParams(state)
      if (next.toString() !== searchParams.toString()) {
        setSearchParams(next, { replace: true })
      }
    },
    [
      page,
      pageSize,
      searchTerm,
      sortBy,
      sortOrder,
      minRating,
      year,
      genre,
      searchParams,
      setSearchParams,
    ]
  )

  useEffect(() => {
    syncUrl({})
  }, [page, pageSize, searchTerm, sortBy, sortOrder, minRating, year, genre, syncUrl])

  const { data, isLoading, isError, error } = useGetMoviesQuery({
    page,
    pageSize,
    q: searchTerm,
    hybrid: true,
    sortBy,
    sortOrder,
    minRating: minRating ?? undefined,
    year: year || undefined,
    genre: genre || undefined,
  })

  const resetFilters = () => {
    setInputValue('')
    setSearchTerm('')
    setMinRating(null)
    setYear('')
    setGenre('')
    setSortBy('id')
    setSortOrder('asc')
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setSearchParams({}, { replace: true })
  }

  const movies = data?.items || []
  const pagination = data?.pagination || { page: 1, pageSize: 12, total: 0, totalPages: 0 }
  const meta = data?.meta || null

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}>加载中...</div>
  if (isError) return <div style={{ color: 'red' }}>错误: {error?.status || '请求失败'}</div>

  return (
    <div style={{ padding: 24 }}>
      <Search
        style={{ marginBottom: 12 }}
        placeholder="请输入电影名称/导演/演员"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onSearch={() => {
          setSearchTerm(inputValue.trim())
          setPage(1)
        }}
        enterButton
      />

      <Space wrap style={{ marginBottom: 16 }} align="center">
        <Select
          value={sortBy}
          style={{ width: 140 }}
          onChange={(v) => {
            setSortBy(v)
            setPage(1)
          }}
          options={[
            { value: 'id', label: '按ID' },
            { value: 'rating', label: '按评分' },
            { value: 'year', label: '按年份' },
            { value: 'title', label: '按片名' },
          ]}
        />
        <Select
          value={sortOrder}
          style={{ width: 120 }}
          onChange={(v) => {
            setSortOrder(v)
            setPage(1)
          }}
          options={[
            { value: 'asc', label: '升序' },
            { value: 'desc', label: '降序' },
          ]}
        />
        <span>最低评分</span>
        <InputNumber
          min={0}
          max={10}
          step={0.1}
          placeholder="如 8"
          value={minRating}
          onChange={(v) => {
            setMinRating(v)
            setPage(1)
          }}
          style={{ width: 100 }}
        />
        <Input
          placeholder="年份 如 2010"
          value={year}
          onChange={(e) => {
            setYear(e.target.value.trim())
            setPage(1)
          }}
          style={{ width: 120 }}
          allowClear
        />
        <Select
          value={genre}
          style={{ width: 120 }}
          onChange={(v) => {
            setGenre(v)
            setPage(1)
          }}
          options={GENRE_OPTIONS}
        />
        <Button onClick={resetFilters}>重置筛选</Button>
      </Space>

      <Row gutter={[16, 16]}>
        {movies.map((movie) => (
          <Col key={movie.documentId} xs={24} sm={12} md={8} lg={6}>
            <MovieCard movie={movie} />
          </Col>
        ))}
      </Row>

      {meta?.hybrid && searchTerm && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message={`搜索来源：${meta.source}${
            meta.fallbackTriggered
              ? `（TMDB 回退：抓取 ${meta.tmdbFetched} 条，写回 ${meta.tmdbPersisted} 条）`
              : ''
          }`}
        />
      )}

      {movies.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>未找到相关电影</div>
      )}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
        <Pagination
          current={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger
          showTotal={(total) => `共 ${total} 条`}
          onChange={(newPage, newPageSize) => {
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize)
              setPage(1)
              return
            }
            setPage(newPage)
          }}
        />
      </div>
    </div>
  )
}

export default MovieList
