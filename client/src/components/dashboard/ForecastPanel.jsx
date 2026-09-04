import React, { useMemo, useState } from 'react'
import { Alert, Card, Select, Space, Typography } from 'antd'
import EChartBox from './EChartBox'
import { useGetForecastQuery, useGetGenresQuery } from '@/store/API/analyticsApi'

const { Text, Paragraph } = Typography

export default function ForecastPanel() {
  const [genre, setGenre] = useState('')
  const { data: genres = [] } = useGetGenresQuery()
  const { data: forecast, isLoading } = useGetForecastQuery({ genre, horizon: 3 })

  const insufficient = forecast?.insufficient
  const methodLabel =
    forecast?.method === 'ai-constrained'
      ? 'AI 外推（受历史区间约束）+ 统计基线'
      : forecast?.method === 'wma+linear'
        ? '统计基线（WMA + 线性外推）'
        : forecast?.method || 'wma+linear'

  const option = useMemo(() => {
    if (insufficient) return null
    const history = forecast?.history || []
    const baseline = forecast?.baseline || forecast?.forecast || []
    const ai = forecast?.aiForecast || []
    const x = [
      ...history.map((h) => h.bucket),
      ...baseline.map((f) => f.bucket),
      ...(ai.length ? ai.map((f) => f.bucket) : []),
    ]
    const uniqX = [...new Set(x)]
    const historyValues = history.map((h) => h.value)
    const baselineValues = [
      ...Array(Math.max(history.length - 1, 0)).fill(null),
      history.length ? history[history.length - 1].value : null,
      ...baseline.map((f) => f.value),
    ]
    const aiValues = ai.length
      ? [
          ...Array(Math.max(history.length - 1, 0)).fill(null),
          history.length ? history[history.length - 1].value : null,
          ...ai.map((f) => f.value),
        ]
      : null

    const series = [
      {
        name: '历史（快照）',
        type: 'line',
        data: historyValues,
        smooth: true,
        itemStyle: { color: '#1677ff' },
      },
      {
        name: '统计基线',
        type: 'line',
        data: baselineValues,
        smooth: true,
        lineStyle: { type: 'dashed' },
        itemStyle: { color: '#fa8c16' },
      },
    ]
    if (aiValues) {
      series.push({
        name: 'AI 外推',
        type: 'line',
        data: aiValues,
        smooth: true,
        lineStyle: { type: 'dotted' },
        itemStyle: { color: '#52c41a' },
      })
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: series.map((s) => s.name) },
      xAxis: { type: 'category', data: uniqX.length ? uniqX : x },
      yAxis: { type: 'value', name: '平均热度' },
      series,
    }
  }, [forecast, insufficient])

  return (
    <Card
      title="热播趋势预测"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="全部类型"
            style={{ width: 140 }}
            value={genre || undefined}
            onChange={(v) => setGenre(v || '')}
            options={genres.map((g) => ({ value: g.genre, label: g.genre }))}
          />
        </Space>
      }
    >
      {insufficient ? (
        <Alert
          type="info"
          showIcon
          message="数据不足，暂不预测"
          description={
            forecast?.explanation ||
            `需要至少 ${forecast?.minPointsRequired || 5} 个日快照点。请运行 server/scripts/snapshotAnalytics.js。`
          }
        />
      ) : (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            数据来源：analytics_snapshots · {methodLabel}
          </Text>
          {forecast?.explanation ? (
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {forecast.explanation}
            </Paragraph>
          ) : null}
          <EChartBox option={option} height={340} loading={isLoading} />
        </>
      )}
    </Card>
  )
}
