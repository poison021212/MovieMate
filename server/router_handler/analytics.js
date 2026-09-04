const db = require('../db/index.js')
const { isStaff } = require('../utils/roles.js')
const {
  getGenreDistribution,
  getYearTrends,
  getTopPopular,
  getForecastSeries,
  getPlatformOverview,
  getMeTaste,
  getMeRatings,
  getMeActivity,
  getMeAiUsage,
} = require('../utils/analyticsCore.js')

async function resolveStaffRole(req) {
  if (!req.user?.username) return null
  const [rows] = await db.query('SELECT role FROM users WHERE username = ? LIMIT 1', [
    req.user.username,
  ])
  return rows[0]?.role || null
}

exports.getOverview = async (req, res) => {
  try {
    const data = await getPlatformOverview()
    const role = await resolveStaffRole(req)
    if (!isStaff(role)) {
      delete data.userCount
    }
    res.success({ message: '平台概览', data }, 200)
  } catch (err) {
    console.error('analytics overview', err)
    res.cc('获取平台概览失败', 500)
  }
}

exports.getGenres = async (req, res) => {
  try {
    const data = await getGenreDistribution()
    res.success({ message: '类型分布', data }, 200)
  } catch (err) {
    console.error('analytics genres', err)
    res.cc('获取类型分布失败', 500)
  }
}

exports.getYearTrends = async (req, res) => {
  try {
    const data = await getYearTrends()
    res.success({ message: '年份趋势', data }, 200)
  } catch (err) {
    console.error('analytics year trends', err)
    res.cc('获取年份趋势失败', 500)
  }
}

exports.getTopPopular = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30)
    const data = await getTopPopular(limit)
    res.success({ message: '热度 Top', data }, 200)
  } catch (err) {
    console.error('analytics top', err)
    res.cc('获取热度排行失败', 500)
  }
}

exports.getForecast = async (req, res) => {
  try {
    const data = await getForecastSeries({
      genre: req.query.genre || '',
      horizon: req.query.horizon,
    })
    res.success({ message: '趋势预测', data }, 200)
  } catch (err) {
    console.error('analytics forecast', err)
    res.cc('获取预测数据失败', 500)
  }
}

exports.getMeTaste = async (req, res) => {
  try {
    const data = await getMeTaste(req.user.username)
    res.success({ message: '我的口味', data }, 200)
  } catch (err) {
    console.error('analytics me taste', err)
    res.cc('获取我的口味失败', 500)
  }
}

exports.getMeRatings = async (req, res) => {
  try {
    const data = await getMeRatings(req.user.username)
    res.success({ message: '我的评分分布', data }, 200)
  } catch (err) {
    console.error('analytics me ratings', err)
    res.cc('获取评分分布失败', 500)
  }
}

exports.getMeActivity = async (req, res) => {
  try {
    const data = await getMeActivity(req.user.username)
    res.success({ message: '我的活跃', data }, 200)
  } catch (err) {
    console.error('analytics me activity', err)
    res.cc('获取活跃数据失败', 500)
  }
}

exports.getMeAiUsage = async (req, res) => {
  try {
    const data = await getMeAiUsage(req.user.username)
    res.success({ message: 'AI 使用统计', data }, 200)
  } catch (err) {
    console.error('analytics me ai', err)
    res.cc('获取 AI 使用统计失败', 500)
  }
}
