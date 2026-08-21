import React from 'react'
import { Typography, Tabs } from 'antd'
import PlatformCharts from '@/components/dashboard/PlatformCharts'
import ForecastPanel from '@/components/dashboard/ForecastPanel'
import MyInsightPanel from '@/components/dashboard/MyInsightPanel'

const { Title, Paragraph } = Typography

export default function DashboardPage() {
  const items = [
    {
      key: 'platform',
      label: '平台趋势',
      children: (
        <>
          <PlatformCharts />
          <div style={{ marginTop: 16 }}>
            <ForecastPanel />
          </div>
        </>
      ),
    },
    {
      key: 'me',
      label: '我的洞察',
      children: <MyInsightPanel />,
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Title level={2}>数据洞察</Title>
      <Paragraph type="secondary">
        基于站内片库与用户行为的 ECharts 可视化；预测为加权移动平均 + 线性外推，供趋势参考。
      </Paragraph>
      <Tabs items={items} />
    </div>
  )
}
