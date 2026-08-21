import { createSlice } from '@reduxjs/toolkit'

/** 收藏状态由 RTK Query favoriteApi + MySQL 管理，不再写 localStorage */
export const favoriteSlice = createSlice({
  name: 'favorite',
  initialState: {
    ids: [],
  },
  reducers: {
    addFavorite: (state, action) => {
      if (!state.ids.includes(action.payload)) {
        state.ids.push(action.payload)
      }
    },
    removeFavorite: (state, action) => {
      state.ids = state.ids.filter((id) => id !== action.payload)
    },
  },
})

export const { addFavorite, removeFavorite } = favoriteSlice.actions
export default favoriteSlice.reducer
