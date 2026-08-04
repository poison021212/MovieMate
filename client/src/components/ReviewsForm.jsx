import { useGetReviewQuery, useAddReviewMutation, useDelReviewMutation, useGetReviewRepliesQuery, useAddReviewReplyMutation, useDeleteReviewReplyMutation } from "../store/API/reviewApi";
import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { Form, Input, message, Rate, List, Avatar, Divider, Space, Button, Alert } from 'antd';
import { UserOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom'
import { useSelector } from "react-redux";
import { confirmDanger } from '@/utils/confirmDialog';

const { TextArea } = Input;

function ReviewThreadItem({ item, auth, navigate, location, onDeleteReview }) {
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [expanded, setExpanded] = useState(false);

  const { data: repliesData, refetch: refetchReplies } = useGetReviewRepliesQuery(item.documentId, {
    skip: !showReplies,
  });
  const [addReply] = useAddReviewReplyMutation();
  const [deleteReply] = useDeleteReviewReplyMutation();

  const replies = repliesData?.data || [];

  const submitReply = async () => {
    if (!auth.isLogin) {
      message.error('请先登录');
      navigate('/auth', { state: { from: location } });
      return;
    }
    if (!replyText.trim()) return;
    try {
      await addReply({ reviewId: item.documentId, content: replyText.trim() }).unwrap();
      setReplyText('');
      refetchReplies();
      message.success('回复成功');
    } catch {
      message.error('回复失败');
    }
  };

  const content = item.content || '';
  const long = content.length > 100;
  const canDeleteReview =
    auth.isLogin && item.username === auth.userInfo?.username;

  return (
    <List.Item
      key={item.id}
      style={{ alignItems: 'flex-start' }}
      actions={
        canDeleteReview
          ? [
              <Button
                key="delete"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除评论"
                onClick={() => onDeleteReview(item.documentId, item.username)}
              />,
            ]
          : []
      }
    >
      <List.Item.Meta
        avatar={<Avatar icon={<UserOutlined />} />}
        title={
          <Space>
            <span>{item.username || '匿名用户'}</span>
            <Rate allowHalf disabled value={parseFloat(item.rating) || 0} style={{ fontSize: 14 }} />
            <span style={{ color: '#999' }}>{item.date || ''}</span>
          </Space>
        }
        description={
          <div style={{ maxWidth: 640, wordBreak: 'break-word' }}>
            {long && !expanded ? `${content.slice(0, 100)}...` : content}
            {long && (
              <Button type="link" size="small" onClick={() => setExpanded(!expanded)}>
                {expanded ? '收起' : '查看更多'}
              </Button>
            )}
            <div style={{ marginTop: 8 }}>
              <Button type="link" size="small" onClick={() => setShowReplies(!showReplies)}>
                {showReplies ? '收起回复' : `回复 (${replies.length || '…'})`}
              </Button>
            </div>
            {showReplies && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #f0f0f0' }}>
                {replies.map((r) => (
                  <div key={r.id} style={{ marginBottom: 8 }}>
                    <Space>
                      <strong>{r.username}</strong>
                      <span style={{ color: '#999', fontSize: 12 }}>{r.date}</span>
                      {auth.isLogin && r.username === auth.userInfo?.username && (
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={async () => {
                            try {
                              await confirmDanger({
                                title: '删除这条回复？',
                                content: '删除后不可恢复',
                              })
                              await deleteReply(r.documentId || r.id).unwrap()
                              refetchReplies()
                              message.success('已删除回复')
                            } catch (e) {
                              if (e?.message !== 'cancelled') message.error('删除失败')
                            }
                          }}
                        >
                          删除
                        </Button>
                      )}
                    </Space>
                    <div>{r.content}</div>
                  </div>
                ))}
                <TextArea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="回复该评论…"
                  style={{ marginTop: 8 }}
                />
                <Button type="primary" size="small" style={{ marginTop: 8 }} onClick={submitReply}>
                  发表回复
                </Button>
              </div>
            )}
          </div>
        }
      />
    </List.Item>
  );
}

const ReviewsForm = () => {
  const { id } = useParams()
  const { data: reviews, isLoading, isError, refetch } = useGetReviewQuery()
  const [addReview] = useAddReviewMutation()
  const [delReview] = useDelReviewMutation()
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const auth = useSelector(state => state.auth)
  const navigate = useNavigate()
  const location = useLocation()

  if (isLoading) {
    return <div style={{ padding: 24 }}>加载评论中...</div>
  }

  if (isError) {
    return <div style={{ padding: 24 }}>加载评论失败</div>
  }

  const reviewArray = reviews?.data || [];
  const movieIdNum = Number(id);
  const filteredReviews = reviewArray.filter(review => review.movieId === movieIdNum);

  const submitReview = async (values) => {
    if (!auth.isLogin) {
      message.error('请先登录后再发表评论');
      navigate('/auth', { state: { from: location } });
      return;
    }

    setSubmitting(true);
    try {
      const reviewData = {
        data: {
          movieId: Number(id),
          date: values.date,
          rating: values.rating,
          content: values.content
        }
      };
      await addReview(reviewData).unwrap();
      message.success('影评提交成功');
      form.resetFields();
      refetch();
    } catch (error) {
      console.error('提交影评失败:', error);
      message.error('影评提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  const delReviewHandler = (reviewId, username) => {
    if (!auth.isLogin) {
      message.error('请先登录后再删除评论');
      navigate('/auth', { state: { from: location } });
      return;
    }
    if (username !== auth.userInfo?.username) {
      message.error('只能删除自己的评论');
      return;
    }
    confirmDanger({
      title: '删除这条评论？',
      content: '删除后不可恢复，其下的回复也会一并删除',
    })
      .then(async () => {
        try {
          await delReview(reviewId).unwrap();
          message.success('评论删除成功');
          refetch();
        } catch {
          message.error('删除评论失败');
        }
      })
      .catch(() => {});
  }

  return (
    <div style={{ padding: 24 }}>
      <Divider />
      <div>
        <h2>影评 ({filteredReviews.length || 0})</h2>
        <List
          itemLayout="horizontal"
          dataSource={filteredReviews}
          renderItem={(item) => (
            <ReviewThreadItem
              item={item}
              auth={auth}
              navigate={navigate}
              location={location}
              onDeleteReview={delReviewHandler}
            />
          )}
          locale={{ emptyText: '暂无影评' }}
        />
      </div>
      <Divider />
      <div>
        <h3>写观后笔记</h3>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="写下评分与感受后，登录状态下 AI 推荐会参考你的收藏与笔记（轻量口味档案）。"
        />
        <Form form={form} layout="vertical" onFinish={submitReview}>
          <Form.Item name="movieId" initialValue={id} hidden />
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
