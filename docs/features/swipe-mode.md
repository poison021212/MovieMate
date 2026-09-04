# 速览模式

- 状态：已实现
- 负责人：MovieMate 维护者
- 最后核对日期：2026-08-03

## 1. 目标

提供类似短视频的上下滑动浏览体验：滚轮/方向键切换电影，接近列表末尾时分页预加载，减少一次性加载全库的压力。

路由：`/swipe`。

## 2. 不做什么

- 不实现无限循环播放；
- 不在速览内做复杂推荐算法（推荐见 AI 模块）；
- 未登录仍可使用浏览与评论弹窗，收藏需登录。

## 3. 用户流程

1. 进入速览页，加载第 1 页（每页 10 条）；
2. 滚轮下/上或方向键切换当前卡片；
3. 距末尾 2 条内自动请求下一页并追加到本地列表；
4. 可收藏、打开评论弹窗、跳转详情；
5. 仅渲染当前索引 ±1 的卡片 DOM（窗口化）。

## 4. 前后端契约

依赖 [`movie-list-query.md`](movie-list-query.md) 的 `GET /api/movies?page=&pageSize=10&sortBy=id&sortOrder=asc`。

收藏/评论契约见 [`movie-detail-favorite.md`](movie-detail-favorite.md)、[`review-flow.md`](review-flow.md)。

## 5. 性能策略

- `SWIPE_PAGE_SIZE = 10`，`PRELOAD_THRESHOLD = 2`；
- 图片 `loading="lazy"`，`onError` 回退 `/no-image.png`；
- 未登录时 `useGetFavoriteQuery` 使用 `skip` 避免无意义 401。

## 6. 验收标准

- [ ] 首屏加载后可持续向下滑动；
- [ ] 滑到底出现「加载更多」且条数增加；
- [ ] 键盘与滚轮行为一致；
- [ ] 评论弹窗打开时不触发切换。

## 7. 实现位置

- 前端：[`client/src/components/MovieSwipe.jsx`](../../client/src/components/MovieSwipe.jsx)、[`client/src/pages/MovieSwipePage.jsx`](../../client/src/pages/MovieSwipePage.jsx)
- 样式：[`client/src/CSS/MovieSwipe.module.css`](../../client/src/CSS/MovieSwipe.module.css)

## 8. 后续扩展（部分已实现）

- **已实现**：简介语音播报（浏览器 `speechSynthesis`，见 [`client/src/utils/speakText.js`](../../client/src/utils/speakText.js)）；
- 详情 prefetch（RTK Query `useGetMoviesByIdQuery`）；
- 云 TTS 替换 `speakText` 适配层。
