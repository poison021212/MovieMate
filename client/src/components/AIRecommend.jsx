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
  Collapse,
  Timeline,
  Modal,
  Image,
} from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  useGetProfileFeedQuery,
  useListAiSessionsQuery,
  useCreateAiSessionMutation,
  useDeleteAiSessionMutation,
  useGetAiSessionMessagesQuery,
  useSubmitRecommendFeedbackMutation,
} from '@/store/API/vercelApi';
import vercelApi from '@/store/API/vercelApi';
import { streamRecommendChat } from '@/utils/streamRecommendChat';

const { TextArea } = Input;
const { Text, Title } = Typography;

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

function posterUrl(movie) {
  if (movie.poster) return movie.poster;
  if (movie.poster_path) {
    const p = movie.poster_path;
    return p.startsWith('http') ? p : `${TMDB_POSTER_BASE}${p}`;
  }
  return '/no-image.png';
}

function usableChatMovies(movies) {
  return (movies || []).filter((m) => m && String(m.title || '').trim() && m.title !== '暂无');
}

function MovieCard({ movie, onDetail, showFeedback, onFeedback, feedbackDisabled }) {
  return (
    <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Image
          src={posterUrl(movie)}
          alt={movie.title}
          width={72}
          height={108}
          style={{ objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
          fallback="/no-image.png"
          preview={false}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <Text strong ellipsis style={{ flex: 1 }}>
              {movie.title}
            </Text>
            <Button type="link" size="small" style={{ flexShrink: 0, padding: 0 }} onClick={() => onDetail(movie)}>
              详情
            </Button>
          </div>
          <Text type="secondary">{movie.year}</Text>
          {movie.reason && (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>{movie.reason}</p>
          )}
          {movie.local_movie_id && (
            <Tag color="green" style={{ marginTop: 8 }}>
              站内 {movie.local_movie_id}
            </Tag>
          )}
          {showFeedback && (
            <Space size="small" style={{ marginTop: 8 }}>
              <Button
                size="small"
                disabled={feedbackDisabled}
                onClick={() => onFeedback?.(movie, 'like')}
              >
                👍
              </Button>
              <Button
                size="small"
                disabled={feedbackDisabled}
                onClick={() => onFeedback?.(movie, 'dislike')}
              >
                👎
              </Button>
            </Space>
          )}
        </div>
      </div>
    </Card>
  );
}

const AIRecommend = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMovies, setChatMovies] = useState([]);
  const [lastChatMode, setLastChatMode] = useState(null);
  const [lastAgentTrace, setLastAgentTrace] = useState([]);
  const [lastSources, setLastSources] = useState([]);
  const [lastPlan, setLastPlan] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const chatEndRef = useRef(null);
  const shouldAutoScrollRef = useRef(false);
  const messagesLenAtSendRef = useRef(0);
  const chatScrollContainerRef = useRef(null);

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
  const [submitFeedback, { isLoading: feedbackSubmitting }] = useSubmitRecommendFeedbackMutation();

  const profileMovies = profileData?.movies || [];
  const tasteProfile = profileData?.tasteProfile;
  const sessions = sessionsData?.sessions || [];
  const messages = messagesData?.messages || [];

  useEffect(() => {
    if (!auth.isLogin) {
      setActiveSessionId(null);
      return;
    }
    if (sessions.length === 0) {
      if (activeSessionId != null && !sessionsLoading) setActiveSessionId(null);
      return;
    }
    const selectedExists = sessions.some((s) => s.id === activeSessionId);
    if (!activeSessionId || !selectedExists) {
      setActiveSessionId(sessions[0].id);
    }
  }, [auth.isLogin, sessions, activeSessionId, sessionsLoading]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const messagesUpdated = messages.length > messagesLenAtSendRef.current;
    if (!pendingUserMessage && chatLoading) return;
    if (!pendingUserMessage && !messagesUpdated) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messagesUpdated && !chatLoading) {
      shouldAutoScrollRef.current = false;
    }
  }, [messages, chatLoading, pendingUserMessage]);

  const goToAuth = () => {
    navigate('/auth', { state: { from: location } });
  };

  const handleSelectSession = (sessionId) => {
    shouldAutoScrollRef.current = false;
    setActiveSessionId(sessionId);
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = 0;
    }
  };

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

  const handleMovieFeedback = async (movie, action) => {
    if (!auth.isLogin) {
      message.warning('请先登录');
      return;
    }
    try {
      await submitFeedback({
        sessionId: activeSessionId || undefined,
        movieTitle: movie.title,
        localMovieId: movie.local_movie_id || undefined,
        tmdbId: movie.tmdb_id || undefined,
        action,
      }).unwrap();
      message.success(action === 'like' ? '已记录喜欢' : '已记录不喜欢，下轮推荐会参考');
    } catch (err) {
      message.error(err?.data?.error?.message || '反馈失败');
    }
  };

  const handleRefreshBatch = async () => {
    if (!auth.isLogin) {
      message.warning('请先登录');
      return;
    }
    if (!chatMovies.length) {
      message.info('请先通过对话获得推荐片单');
      return;
    }
    try {
      await submitFeedback({
        sessionId: activeSessionId || undefined,
        movieTitle: chatMovies.map((m) => m.title).join('、').slice(0, 250),
        action: 'refresh_batch',
      }).unwrap();
    } catch {
      /* still try to refresh recommendations */
    }
    await handleSendChat('换一批，推荐一些不同的电影，请避开刚才推荐过的片');
  };

  const handleSendChat = async (overrideMessage) => {
    if (!auth.isLogin) {
      message.warning('请先登录后使用 AI 对话');
      goToAuth();
      return;
    }
    const text = (typeof overrideMessage === 'string' ? overrideMessage : chatInput).trim();
    if (!text) return;
    const draft = text;
    if (typeof overrideMessage !== 'string') {
      setChatInput('');
    }
    setPendingUserMessage(draft);
    setStreamingText('');
    setLastPlan([]);
    setLastAgentTrace([]);
    setLastSources([]);
    setLastChatMode(null);
    setChatLoading(true);
    shouldAutoScrollRef.current = true;
    messagesLenAtSendRef.current = messages.length;
    const traceAcc = [];
    try {
      const sessionInList =
        activeSessionId != null && sessions.some((s) => s.id === activeSessionId);
      const sessionIdToSend =
        sessionInList || (sessionsLoading && activeSessionId != null)
          ? activeSessionId
          : undefined;

      let donePayload = null;
      await streamRecommendChat({
        sessionId: sessionIdToSend,
        message: draft,
        token: auth.token,
        onEvent: (event, data) => {
          if (event === 'session' && data.sessionId) {
            setActiveSessionId(data.sessionId);
          }
          if (event === 'plan') {
            setLastPlan(data.steps || []);
            traceAcc.push({ tool: 'plan_tasks', ok: true, steps: data.steps });
            setLastAgentTrace([...traceAcc]);
          }
          if (event === 'trace' && data.entry) {
            traceAcc.push(data.entry);
            setLastAgentTrace([...traceAcc]);
          }
          if (event === 'token' && data.text) {
            setStreamingText((prev) => prev + data.text);
          }
          if (event === 'error' && data.message) {
            message.warning(String(data.message).slice(0, 240));
          }
          if (event === 'done') {
            donePayload = data;
          }
        },
      });

      setPendingUserMessage(null);
      setStreamingText('');
      if (donePayload) {
        setActiveSessionId(donePayload.sessionId);
        setChatMovies(usableChatMovies(donePayload.movies));
        setLastChatMode(donePayload.meta?.mode || null);
        setLastAgentTrace(donePayload.meta?.agentTrace || traceAcc);
        setLastSources(donePayload.meta?.sources || []);
        if (donePayload.meta?.plan) setLastPlan(donePayload.meta.plan);
      }
      dispatch(
        vercelApi.util.invalidateTags(['AiSessions', 'ProfileFeed', { type: 'AiMessages', id: donePayload?.sessionId }])
      );
    } catch (err) {
      setPendingUserMessage(null);
      setStreamingText('');
      setChatInput(draft);
      shouldAutoScrollRef.current = false;
      message.error(err?.message || '发送失败');
    } finally {
      setChatLoading(false);
    }
  };

  const displayMovies = chatMovies.length > 0 ? chatMovies : profileMovies;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Title level={2}>AI 电影推荐</Title>
      <Text type="secondary">
        左侧为画像推荐；右侧支持片单推荐、演职员事实问答（导演/制片人等）与电影话题闲聊（需登录）。
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
            {chatMovies.length > 0 && auth.isLogin && (
              <Button
                size="small"
                style={{ marginBottom: 12 }}
                loading={chatLoading}
                onClick={handleRefreshBatch}
              >
                换一批
              </Button>
            )}
            {displayMovies.length === 0 ? (
              <Empty description="暂无推荐，请先同步片库或登录后积累收藏" />
            ) : (
              displayMovies.map((movie, idx) => (
                <MovieCard
                  key={`${movie.local_movie_id || movie.tmdb_id || movie.title}-${idx}`}
                  movie={movie}
                  onDetail={goDetail}
                  showFeedback={auth.isLogin && chatMovies.length > 0}
                  onFeedback={handleMovieFeedback}
                  feedbackDisabled={feedbackSubmitting || chatLoading}
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
                <Button type="primary" onClick={goToAuth}>
                  去登录
                </Button>
              </Empty>
            ) : (
              <>
                <SelectSessionBar
                  sessions={sessions}
                  loading={sessionsLoading}
                  activeId={activeSessionId}
                  onSelect={handleSelectSession}
                />
                {lastChatMode && (
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                    上一轮模式：
                    {lastChatMode === 'recommend'
                      ? '片单推荐'
                      : lastChatMode === 'qa'
                        ? '事实问答'
                        : lastChatMode === 'chat'
                          ? '话题闲聊'
                          : lastChatMode === 'agent'
                            ? 'Agent'
                            : lastChatMode}
                  </Text>
                )}
                {lastPlan.length > 0 && (
                  <Collapse
                    size="small"
                    style={{ marginBottom: 12 }}
                    items={[
                      {
                        key: 'plan',
                        label: `执行计划（${lastPlan.length} 步）`,
                        children: (
                          <ol style={{ margin: 0, paddingLeft: 20 }}>
                            {lastPlan.map((step) => (
                              <li key={step.id || step.tool}>
                                <Text code>{step.tool}</Text> — {step.reason}
                              </li>
                            ))}
                          </ol>
                        ),
                      },
                    ]}
                  />
                )}
                {lastAgentTrace.length > 0 && (
                  <Collapse
                    size="small"
                    style={{ marginBottom: 12 }}
                    items={[
                      {
                        key: 'trace',
                        label: `工具轨迹（${lastAgentTrace.length} 步）`,
                        children: (
                          <Timeline
                            items={lastAgentTrace.map((step, idx) => ({
                              color: step.ok ? 'green' : 'red',
                              children: (
                                <div key={idx}>
                                  <Text code>{step.tool}</Text>
                                  {step.latencyMs != null && (
                                    <Text type="secondary"> · {step.latencyMs}ms</Text>
                                  )}
                                  {!step.ok && <Text type="danger"> 失败</Text>}
                                  {step.degraded && <Text type="warning"> 降级</Text>}
                                </div>
                              ),
                            }))}
                          />
                        ),
                      },
                    ]}
                  />
                )}
                {lastSources.length > 0 && (
                  <Collapse
                    size="small"
                    style={{ marginBottom: 12 }}
                    items={[
                      {
                        key: 'sources',
                        label: `来源引用（${lastSources.length}）`,
                        children: (
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {lastSources.map((src, idx) => (
                              <li key={idx}>
                                <Text code>{src.type}</Text>
                                {src.tmdb_id != null && ` tmdb:${src.tmdb_id}`}
                                {src.local_id != null && ` local:${src.local_id}`}
                                {src.count != null && ` ×${src.count}`}
                              </li>
                            ))}
                          </ul>
                        ),
                      },
                    ]}
                  />
                )}
                <div
                  ref={chatScrollContainerRef}
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
                      {msg.meta?.agentTrace?.length > 0 && (
                        <Collapse
                          size="small"
                          style={{ marginTop: 8, maxWidth: 420 }}
                          items={[
                            {
                              key: 'hist-trace',
                              label: `工具轨迹 ${msg.meta.agentTrace.length} 步`,
                              children: (
                                <Timeline
                                  size="small"
                                  items={msg.meta.agentTrace.map((step, idx) => ({
                                    color: step.ok ? 'green' : 'red',
                                    children: (
                                      <span key={idx}>
                                        {step.tool}
                                        {step.latencyMs != null ? ` (${step.latencyMs}ms)` : ''}
                                      </span>
                                    ),
                                  }))}
                                />
                              ),
                            },
                          ]}
                        />
                      )}
                    </div>
                  ))}
                  {pendingUserMessage && (
                    <div style={{ marginBottom: 12, textAlign: 'right' }}>
                      <Tag color="blue">我</Tag>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{pendingUserMessage}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        发送中…
                      </Text>
                    </div>
                  )}
                  {streamingText && (
                    <div style={{ marginBottom: 12, textAlign: 'left' }}>
                      <Tag color="green">AI</Tag>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{streamingText}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        生成中…
                      </Text>
                    </div>
                  )}
                  {chatLoading && !pendingUserMessage && !streamingText && <Spin size="small" />}
                  <div ref={chatEndRef} />
                </div>
                <TextArea
                  rows={3}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="例如：《盗梦空间》的导演和制片人是谁？/ 聊聊诺兰的非线性叙事 / 推荐几部近年悬疑"
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
