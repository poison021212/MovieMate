import React, { useMemo } from 'react'
import { Card, Col, Row, Empty, Statistic, Tag, Space } from 'antd'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import EChartBox from './EChartBox'
import {
  useGetMeTasteQuery,
  useGetMeRatingsQuery,
  useGetMeActivityQuery,
  useGetMeAiUsageQuery,
} from '@/store/API/analyticsApi'

export default function MyInsightPanel() {
  const auth = useSelector((state) => state.auth)
  const skip = !auth.isLogin

  const { data: taste } = useGetMeTasteQuery(undefined, { skip })
  const { data: ratings = [] } = useGetMeRatingsQuery(undefined, { skip })
  const { data: activity = [] } = useGetMeActivityQuery(undefined, { skip })
  const { data: aiUsage = [] } = useGetMeAiUsageQuery(undefined, { skip })

  const radarOption = useMemo(
    () => ({
      tooltip: {},
      radar: {
        indicator: (taste?.genreRadar || []).map((g) => ({
          name: g.genre,
          max: Math.max(...(taste?.genreRadar || []).map((x) => x.score), 1),
        })),
      },
      series: [
        {
          type: 'radar',
          data: [{ value: (taste?.genreRadar || []).map((g) => g.score), name: '口味' }],
          areaStyle: { opacity: 0.2 },
        },
      ],
    }),
    [taste]
  )

  const ratingOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ratings.map((r) => String(r.rating)) },
      yAxis: { type: 'value', name: '条数' },
      series: [{ type: 'bar', data: ratings.map((r) => r.count), itemStyle: { color: '#13c2c2' } }],
    }),
    [ratings]
  )

  const activityOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: activity.map((a) => a.day) },
      yAxis: { type: 'value' },
      series: [{ type: 'line', smooth: true, data: activity.map((a) => a.count) }],
    }),
    [activity]
  )

  const aiOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { data: ['AI 回复', '均 grounding'] },
      xAxis: { type: 'category', data: aiUsage.map((a) => a.day) },
      yAxis: [{ type: 'value' }, { type: 'value', max: 10 }],
      series: [
        { name: 'AI 回复', type: 'bar', data: aiUsage.map((a) => a.messages) },
        {
          name: '均 grounding',
          type: 'line',
          yAxisIndex: 1,
          data: aiUsage.map((a) => a.avgGrounded),
        },
      ],
    }),
    [aiUsage]
  )

  if (!auth.isLogin) {
    return (
      <Card title="我的洞察">
        <Empty description="登录后查看收藏/评论/AI 使用画像">
          <Link to="/auth">去登录</Link>
        </Empty>
      </Card>
    )
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="收藏" value={taste?.favoritesCount ?? 0} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="评论" value={taste?.reviewsCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card title="偏好标签">
            <Space wrap>
              {(taste?.tasteProfile?.topGenres || []).map((g) => (
                <Tag key={g} color="blue">{g}</Tag>
              ))}
              {taste?.tasteProfile?.yearRange && <Tag>{taste.tasteProfile.yearRange}</Tag>}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="口味雷达">
            {(taste?.genreRadar || []).length ? (
              <EChartBox option={radarOption} />
            ) : (
              <Empty description="暂无收藏类型数据" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="评分分布">
            {ratings.length ? (
              <EChartBox option={ratingOption} />
            ) : (
              <Empty description="暂无评论评分" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="评论活跃">
            {activity.length ? (
              <EChartBox option={activityOption} />
            ) : (
              <Empty description="暂无活跃数据" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="AI 使用">
            {aiUsage.length ? (
              <EChartBox option={aiOption} />
            ) : (
              <Empty description="暂无 AI 对话记录" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
