import React from 'react'
import ReactECharts from 'echarts-for-react'

export default function EChartBox({ option, height = 320, loading = false }) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
      showLoading={loading}
    />
  )
}
