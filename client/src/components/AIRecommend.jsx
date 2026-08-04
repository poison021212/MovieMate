import { useState, useEffect, useRef } from 'react';
import {
  Input,
  Button,
  Spin,
  message,
  Card,
  Space,
  Tag,
  Row,
  Col,
  List,
  Typography,
  Empty,
  Modal,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  useGetProfileFeedQuery,
  useListAiSessionsQuery,
  useCreateAiSessionMutation,
  useDeleteAiSessionMutation,
  useGetAiSessionMessagesQuery,
  useRecommendChatMutation,
} from '@/store/API/vercelApi';

const { TextArea } = Input;
const { Text, Title } = Typography;

function MovieCard({ movie, onDetail, onNote }) {
  return (
    <Card
      size="small"
      title={movie.title}
      style={{ marginBottom: 12 }}
      extra={
        <Space>
          <Button type="link" size="small" onClick={() => onDetail(movie)}>
            详情
          </Button>
          <Button type="link" size="small" onClick={() => onNote(movie)}>
            笔记
          </Button>
        </Space>
      }
    >
      <Text type="secondary">{movie.year}</Text>
      {movie.reason && <p style={{ marginTop: 8 }}>{movie.reason}</p>}
      {movie.local_movie_id && <Tag color="green">站内 {movie.local_movie_id}</Tag>}
    </Card>
  );
}

const AIRecommend = () => {
  const navigate = useNavigate();
  const auth = useSelector((state) => state.auth);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMovies, setChatMovies] = useState([]);
  const chatEndRef = useRef(null);

  const { data: profileData, isLoading: profileLoading } = useGetProfileFeedQuery();
  const { data: sessionsData, isLoading: sessionsLoading } = useListAiSessionsQuery(undefined, {
    skip: !auth.isLogin,
  });
  const { data: messagesData, isFetching: messagesFetching } = useGetAiSessionMessagesQuery(
    activeSessionId,
    { skip: !auth.isLogin || !activeSessionId }
  );

  const [createSession] = useCreateAiSessionMutation();
  const [deleteSession] = useDeleteAiSessionMutation();
  const [recommendChat, { isLoading: chatLoading }] = useRecommendChatMutation();

  const profileMovies = profileData?.movies || [];
  const tasteProfile = profileData?.tasteProfile;
  const sessions = sessionsData?.sessions || [];
  const messages = messagesData?.messages || [];

  useEffect(() => {
    if (!auth.isLogin) {
      setActiveSessionId(null);
      return;
    }
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [auth.isLogin, sessions, activeSessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const goDetail = (movie) => {
    const localId = movie.local_movie_id;
    if (localId) {
      navigate(`/movie/${localId}`);
      return;
    }
    if (movie.id) {
      window.open(`https://www.themoviedb.org/movie/${movie.id}`, '_blank');
      return;
    }
    message.warning('暂无站内详情');
  };

  const goWriteNote = (movie) => {
    if (!movie.local_movie_id) {
      message.info('该片尚未入库');
      return;
    }
    navigate(`/movie/${movie.local_movie_id}#movie-review`);
  };

  const handleNewSession = async () => {
    try {
      const res = await createSession({ title: '新会话' }).unwrap();
      setActiveSessionId(res.sessionId);
      setChatMovies([]);
      message.success('已创建会话');
    } catch {
      message.error('创建会话失败，请先登录');
    }
  };

  const handleDeleteSession = () => {
    if (!activeSessionId) return;
    Modal.confirm({
      title: '删除此会话？',
      content: '会话消息将一并删除',
      onOk: async () => {
        try {
          await deleteSession(activeSessionId).unwrap();
          setActiveSessionId(null);
          setChatMovies([]);
          message.success('已删除');
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleSendChat = async () => {
    if (!auth.isLogin) {
      message.warning('请先登录后使用 AI 对话');
      navigate('/auth');
      return;
    }
    const text = chatInput.trim();
    if (!text) return;
    try {
      const result = await recommendChat({
        sessionId: activeSessionId || undefined,
        message: text,
      }).unwrap();
      setActiveSessionId(result.sessionId);
      setChatMovies(result.movies || []);
      setChatInput('');
    } catch (err) {
      message.error(err?.data?.error?.message || '发送失败');
    }
  };

  const displayMovies = chatMovies.length > 0 ? chatMovies : profileMovies;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Title level={2}>AI 电影推荐</Title>
      <Text type="secondary">
        左侧根据收藏与观后笔记生成画像推荐；右侧为多轮会话（需登录），结果优先跳转站内详情。
      </Text>

      <Row gutter={24} style={{ marginTop: 24 }}>
        <Col xs={24} lg={14}>
          <Card title="猜你喜欢" loading={profileLoading}>
            {tasteProfile && (
              <Space wrap style={{ marginBottom: 16 }}>
                {(tasteProfile.topGenres || []).map((g) => (
                  <Tag key={g} color="blue">
                    {g}
                  </Tag>
                ))}
                {tasteProfile.yearRange && <Tag>{tasteProfile.yearRange}</Tag>}
              </Space>
            )}
            {!auth.isLogin && (
              <Tag style={{ marginBottom: 12 }}>登录后可结合收藏与评论优化画像</Tag>
            )}
            {chatMovies.length > 0 && (
              <Tag color="purple" style={{ marginBottom: 12 }}>
                当前展示：对话最新推荐
              </Tag>
            )}
            {displayMovies.length === 0 ? (
              <Empty description="暂无推荐，请先同步片库或登录后积累收藏" />
            ) : (
              displayMovies.map((movie, idx) => (
                <MovieCard
                  key={`${movie.local_movie_id || movie.tmdb_id || movie.title}-${idx}`}
                  movie={movie}
                  onDetail={goDetail}
                  onNote={goWriteNote}
                />
              ))
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="AI 对话"
            extra={
              auth.isLogin ? (
                <Space>
                  <Button size="small" onClick={handleNewSession}>
                    新会话
                  </Button>
                  <Button size="small" danger disabled={!activeSessionId} onClick={handleDeleteSession}>
                    删除
                  </Button>
                </Space>
              ) : null
            }
          >
            {!auth.isLogin ? (
              <Empty description="登录后可多轮对话并保存会话">
                <Button type="primary" onClick={() => navigate('/auth')}>
                  去登录
                </Button>
              </Empty>
            ) : (
              <>
                <SelectSessionBar
                  sessions={sessions}
                  loading={sessionsLoading}
                  activeId={activeSessionId}
                  onSelect={setActiveSessionId}
                />
                <div
                  style={{
                    height: 360,
                    overflowY: 'auto',
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    background: '#fafafa',
                  }}
                >
                  {(messagesFetching && !messages.length) && <Spin />}
                  {messages.length === 0 && !messagesFetching && (
                    <Text type="secondary">发送消息开始推荐对话</Text>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        marginBottom: 12,
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                      }}
                    >
                      <Tag color={msg.role === 'user' ? 'blue' : 'green'}>{msg.role === 'user' ? '我' : 'AI'}</Tag>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      {msg.movies?.length > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          附带 {msg.movies.length} 部推荐
                        </Text>
                      )}
                    </div>
                  ))}
                  {chatLoading && <Spin size="small" />}
                  <div ref={chatEndRef} />
                </div>
                <TextArea
                  rows={3}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="例如：再推荐几部近年的悬疑片，不要恐怖"
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                />
                <Button
                  type="primary"
                  block
                  style={{ marginTop: 12 }}
                  loading={chatLoading}
                  onClick={handleSendChat}
                >
                  发送
                </Button>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

function SelectSessionBar({ sessions, loading, activeId, onSelect }) {
  if (loading) return <Spin size="small" style={{ marginBottom: 12 }} />;
  if (!sessions.length) {
    return <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>暂无历史会话</Text>;
  }
  return (
    <List
      size="small"
      style={{ marginBottom: 12, maxHeight: 120, overflow: 'auto' }}
      dataSource={sessions}
      renderItem={(item) => (
        <List.Item
          style={{
            cursor: 'pointer',
            background: item.id === activeId ? '#e6f4ff' : undefined,
            padding: '4px 8px',
            borderRadius: 4,
          }}
          onClick={() => onSelect(item.id)}
        >
          {item.title || `会话 ${item.id}`}
        </List.Item>
      )}
    />
  );
}

export default AIRecommend;
