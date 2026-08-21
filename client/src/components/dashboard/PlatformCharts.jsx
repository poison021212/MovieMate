import React, { useMemo } from 'react'
import { Card, Col, Row, Statistic, Table, Alert } from 'antd'
import EChartBox from './EChartBox'
import {
  useGetOverviewQuery,
  useGetGenresQuery,
  useGetYearTrendsQuery,
  useGetTopPopularQuery,
} from '@/store/API/analyticsApi'

export default function PlatformCharts() {
  const { data: overview } = useGetOverviewQuery()
  const { data: genres = [], isLoading: genresLoading } = useGetGenresQuery()
  const { data: yearTrends = [], isLoading: yearLoading } = useGetYearTrendsQuery()
  const { data: topPopular = [], isLoading: topLoading } = useGetTopPopularQuery(10)

  const genreOption = useMemo(
    () => ({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: genres.map((g) => ({ name: g.genre, value: g.count })),
        },
      ],
    }),
    [genres]
  )

  const yearOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { data: ['片量', '均分'] },
      xAxis: { type: 'category', data: yearTrends.map((y) => y.year) },
      yAxis: [{ type: 'value', name: '片量' }, { type: 'value', name: '均分', max: 10 }],
      series: [
        {
          name: '片量',
          type: 'bar',
          data: yearTrends.map((y) => y.count),
          itemStyle: { color: '#1677ff' },
        },
        {
          name: '均分',
          type: 'line',
          yAxisIndex: 1,
          data: yearTrends.map((y) => y.avgRating),
          itemStyle: { color: '#52c41a' },
        },
      ],
    }),
    [yearTrends]
  )

  const topOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 120, right: 24 },
      xAxis: { type: 'value' },
      yAxis: {
        type: 'category',
        data: [...topPopular].reverse().map((m) => m.title),
        axisLabel: { width: 100, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          data: [...topPopular]
            .reverse()
            .map((m) => m.popularity ?? m.rating),
          itemStyle: { color: '#722ed1' },
        },
      ],
    }),
    [topPopular]
  )

  const hybrid = overview?.hybrid

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card><Statistic title="片库总量" value={overview?.movieCount ?? '—'} /></Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card><Statistic title="注册用户" value={overview?.userCount ?? '—'} /></Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card><Statistic title="影评总数" value={overview?.reviewCount ?? '—'} /></Card>
        </Col>
      </Row>

      {hybrid && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Hybrid 搜索观测（进程内，重启清零）"
          description={`关键词请求 ${hybrid.hybridKeywordRequests} 次 · 本地命中率 ${hybrid.rates?.localOnlyRatePercent ?? 0}% · 回退触发 ${hybrid.rates?.fallbackTriggerRatePercent ?? 0}%`}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="类型分布">
            <EChartBox option={genreOption} loading={genresLoading} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="年份产量与均分">
            <EChartBox option={yearOption} loading={yearLoading} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="热度 Top 10">
            <EChartBox option={topOption} height={360} loading={topLoading} />
          </Card>
        </Col>
      </Row>

      <Card title="热度明细" style={{ marginTop: 16 }}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={topPopular}
          columns={[
            { title: '片名', dataIndex: 'title' },
            { title: '类型', dataIndex: 'genre' },
            { title: '年份', dataIndex: 'year' },
            { title: '评分', dataIndex: 'rating' },
            { title: '热度', dataIndex: 'popularity', render: (v) => v ?? '—' },
          ]}
        />
      </Card>
    </div>
  )
}
