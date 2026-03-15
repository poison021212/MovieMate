import { useGetReviewQuery, useAddReviewMutation, useDelReviewMutation } from "../store/API/reviewApi";
import { useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Form, Input, message, Rate, List, Avatar, Divider, Space, Button } from 'antd';
import { UserOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from "react-redux";

const { TextArea } = Input;
const ReviewsForm = () => {
  const { id } = useParams() // 这里的 id 是电影的 documentId
  const { data: reviews, isLoading, isError, refetch } = useGetReviewQuery()
  const [addReview] = useAddReviewMutation()
  const [delReview] = useDelReviewMutation()
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const auth = useSelector(state => state.auth)
  const navigate = useNavigate()
  const [expandedComments, setExpandedComments] = useState({});
  console.log('reviews data:', reviews)
  // console.log('movie documentId:', id)

  if (isLoading) {
    return <div style={{ padding: 24 }}>加载评论中...</div>
  }

  if (isError) {
    return <div style={{ padding: 24 }}>加载评论失败</div>
  }

  // 正确处理数据结构，并根据 movieId 与 documentId 进行匹配
  const reviewArray = reviews?.data || [];
  const filteredReviews = reviewArray.filter(review => review.movieId === id);

  const submitReview = async (values) => {
    if (!auth.isLogin) {
      navigate('/auth');
      return;
    }

    setSubmitting(true);
    try {
      // 调整数据结构以符合后端 API 要求
      const reviewData = {
        data: {
          movieId: id,
          username: values.username,
          date: values.date,
          rating: values.rating,
          content: values.content
        }
      };
      await addReview(reviewData).unwrap();
      message.success('影评提交成功');
      form.resetFields();
      // 重新获取评论列表，显示新提交的评论
      refetch();
    } catch (error) {
      console.error('提交影评失败:', error);
      message.error('影评提交失败');
    } finally {
      setSubmitting(false);
    }
  }



  const delReviewHandler = async (id, username) => {
    if (!auth.isLogin) {
      message.error('请先登录后再删除评论');
      navigate('/auth');
      return;
    }
    try {
      // 检查是否是当前用户的评论
      if (username !== auth.userInfo?.username) {
        message.error('只能删除自己的评论');
        return;
      }
      await delReview(id, username).unwrap();
      message.success('评论删除成功');
      refetch();
    } catch (error) {
      console.error('删除评论失败:', error);
      message.error('删除评论失败');
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Divider />

      {/* 影评列表 */}
      <div>
        <h2>影评 ({filteredReviews.length || 0})</h2>
        <List
          itemLayout="horizontal"
          dataSource={filteredReviews}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={
                  <Space>
                    <span>{item.username || '匿名用户'}</span>
                    <Rate allowHalf disabled value={parseFloat(item.rating) || 0} style={{ fontSize: 14 }} />
                    <span style={{ color: '#999' }}>{item.date || ''}</span>
                  </Space>
                }
                // 显示评论内容，字数过多时截断显示，点击查看更多，评论内容适配 List.Item 宽度
                description={
                  item.content?.length > 100 ? (
                    <div style={{
                      width: '100%',
                      maxWidth: '600px',
                      whiteSpace: 'normal',//确保空白符正常处理，允许换行
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word',
                    }}>
                      {expandedComments[item.id] ? item.content : `${item.content.slice(0, 100)}...`}
                      <Button style={{
                        color: '#1890ff',
                        border: 'none',
                        backgroundColor: 'transparent',
                        marginLeft: '8px'
                      }} size="small" onClick={() => setExpandedComments(prev => ({
                        ...prev,
                        [item.id]: !prev[item.id]
                      }))}>
                        {expandedComments[item.id] ? '收起' : '查看更多'}
                      </Button>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      maxWidth: '600px',
                      wordBreak: 'break-all',
                      overflowWrap: 'break-word',
                      whiteSpace: 'normal'
                    }}>
                      {item.content || ''}
                    </div>
                  )
                }
              />
              <DeleteOutlined onClick={() => delReviewHandler(item.documentId, item.username)} />
            </List.Item>
          )}
          locale={{ emptyText: '暂无影评' }}
        />

      </div>
      <Divider />

      {/* 写影评表单 */}
      <div>
        <h3>写影评</h3>
        <Form form={form} layout="vertical" onFinish={submitReview}>
          <Form.Item name="movieId" initialValue={id} hidden />
          <Form.Item name="username" initialValue={auth.userInfo?.username || '匿名用户'} hidden />
          {/* 本地日期格式导致错误400，转换为 ISO 格式 */}
          <Form.Item name="date" initialValue={new Date().toISOString().split('T')[0]} hidden />

          <Form.Item name="rating" label="评分" rules={[{ required: true, message: '请选择评分' }]}>
            <Rate allowHalf />
          </Form.Item>
          <Form.Item name="content" label="影评" rules={[{ required: true, message: '请输入影评内容' }]}>
            <TextArea rows={4} placeholder="分享你的观影感受..." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交影评
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
export default ReviewsForm