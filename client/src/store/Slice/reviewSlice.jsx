import { createSlice } from '@reduxjs/toolkit'

/** 评论由 RTK Query reviewApi + MySQL 管理，不再写 localStorage */
export const reviewSlice = createSlice({
  name: 'review',
  initialState: {
    items: [],
  },
  reducers: {
    addReview: (state, action) => {
      state.items.push(action.payload)
    },
    delReview: (state, action) => {
      state.items = state.items.filter((item) => item.documentId !== action.payload)
    },
  },
})

export const { addReview, delReview } = reviewSlice.actions
export default reviewSlice.reducer
