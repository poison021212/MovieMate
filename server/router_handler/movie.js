const db = require('../db/index.js')

// 获取电影列表（分页 + 搜索 + 排序）
exports.getMovies = async (req, res) => {
  try {
    // 1. 解析查询参数
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 12, 1);
    const q = (req.query.q || '').trim();
    const sortBy = (req.query.sortBy || 'id').trim();
    const sortOrder = (req.query.sortOrder || 'asc').toLowerCase();
    const minRatingRaw = req.query.minRating;
    const minRating =
      minRatingRaw !== undefined && minRatingRaw !== ''
        ? Number(minRatingRaw)
        : null;
    const year = (req.query.year || '').trim();
    const genre = (req.query.genre || '').trim();

    // 2. 防止 SQL 注入：排序字段和排序方向必须白名单
    const allowedSortBy = ['id', 'rating', 'year', 'title', 'release_date', 'popularity', 'vote_count'];
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'id';
    const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';

    // 3. 动态 WHERE（搜索 + 筛选）
    const conditions = [];
    const whereParams = [];

    if (q) {
      conditions.push('(title LIKE ? OR director LIKE ? OR actors LIKE ?)');
      whereParams.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (minRating !== null && !Number.isNaN(minRating)) {
      conditions.push('rating >= ?');
      whereParams.push(minRating);
    }
    if (year) {
      conditions.push('year = ?');
      whereParams.push(year);
    }
    if (genre) {
      conditions.push('genre = ?');
      whereParams.push(genre);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 4. 分页参数
    const offset = (page - 1) * pageSize;

    // 5. 查询总数
    const countSql = `SELECT COUNT(*) AS total FROM movies ${whereSql}`;
    const [countRows] = await db.query(countSql, whereParams);
    const total = countRows[0]?.total || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    // 6. 查询当前页数据
    const listSql = `
      SELECT * FROM movies
      ${whereSql}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(listSql, [...whereParams, pageSize, offset]);

    const data = rows.map((movie) => ({
      ...movie,
      documentId: movie.id, // 保持和前端现有逻辑兼容
    }));

    // 7. 返回统一响应
    res.success(
      {
        message: '获取电影列表成功',
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      },
      200
    );
  } catch (err) {
    console.error('getMovies error:', err);
    res.cc('获取电影列表失败', 500);
  }
};

// 获取所有电影
// exports.getMovies = async (req, res) => {
//   try {
    // SELECT * FROM movies order by id desc表示按id降序查询所有电影数据,默认按照id升序
    // const sql = 'SELECT * FROM movies order by id asc'
    // const [result] = await db.query(sql)
    // const data = result.map(movie => ({
    //   ...movie, documentId: movie.id
    // }))
    // res.success({ message: '获取电影列表成功', data }, 200)
  // } catch (err) {
    // res.cc('获取电影列表失败')
  // }
// }

// 获取单部电影详情
exports.getMovieById = async (req, res) => {
  // 从请求参数中获取电影id
  const { id } = req.params
  if (!id || isNaN(id)) {
    return res.cc('电影id参数错误')
  }
  try {
    const sql = 'SELECT * FROM movies where id=?'
    const [result] = await db.query(sql, [id])
    res.success({ message: '获取电影详情成功', data: result[0] }, 200)
  } catch (err) {
    res.cc('获取电影详情失败', 500)
  }
}
