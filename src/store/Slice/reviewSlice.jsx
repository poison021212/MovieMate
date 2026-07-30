import React from 'react'
import { createSlice } from '@reduxjs/toolkit'

const loadReviews = () => {
  try {
    const savedReviews = localStorage.getItem('reviews')
    return savedReviews ? JSON.parse(savedReviews) : []
  } catch (error) {
    return []
  }
}
export const reviewSlice = createSlice({
  name: 'review',
  initialState: () => {
    return {
      items: loadReviews()
    }
  },
  reducers: {
    // 新增评论
    addReview: (state, action) => {
      // action.payload 应该包含 movieId, rating, content, date, userName 等
      state.items.push(action.payload)
      localStorage.setItem('reviews', JSON.stringify(state.items))
    },
    // 删除评论
    delReview: (state, action) => {
      state.items = state.items.filter(item => item.documentId === action.payload)
      localStorage.removesItem('reviews', JSON.stringify(state.items))
    }
  },
})

export const { addReview, delReview } = reviewSlice.actions;
export default reviewSlice.reducer;