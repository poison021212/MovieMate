import React, { useState } from 'react';
import { Flex, Slider, Switch, Typography } from 'antd'
import { useGetReviewQuery } from '@/store/API/reviewApi'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

const profileReview = () => {
  const auth = useSelector(state => state.auth)
  const { data: reviews } = useGetReviewQuery({ username: auth.userInfo?.username })
  const navigate = useNavigate()

  const [rows, setRows] = useState(2);
  const [expanded, setExpanded] = useState(false);

  // 服务端已按 username 筛选，无需前端再次过滤
  const reviewsArr = Array.isArray(reviews?.data) ? reviews.data : []

  const onClickHander = (item) => {
    navigate(`/movie/${item.movieId}`)
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 24 }}>我的评论</h1>
      <Flex gap={16} vertical>
        <Flex gap={16} align="center">
          <Switch
            checked={expanded}
            onChange={() => setExpanded((c) => !c)}
            style={{ flex: 'none' }}
            checkedChildren="收起"
            unCheckedChildren="展开"
          // 切换提示, 展开/收起

          />
          <Slider min={1} max={20} value={rows} onChange={setRows} style={{ flex: 'auto' }} />
        </Flex>

        <Typography.Paragraph
          ellipsis={{
            rows,
            expandable: 'collapsible',
            expanded,
            onExpand: (_, info) => setExpanded(info.expanded),
          }}
        >
          {/* 评论内容, 评论时间 */}
          {reviewsArr.length !== 0 ? reviewsArr.map(item => (
            <div key={item.id} onClick={() => onClickHander(item)} style={{ borderBottom: '1px solid #e8e8e8', padding: '12px 0' }}>
              <Typography.Text copyable={{
                tooltips: ['点击复制', '复制成功']
              }}>{item.content}</Typography.Text>
              <Typography.Text style={{ color: '#999' }}>{item.date || ''}</Typography.Text>
            </div>
          )) :
            <Typography.Text>暂无评论</Typography.Text>
          }
        </Typography.Paragraph>
      </Flex>

    </div >
  )
}

export default profileReview
