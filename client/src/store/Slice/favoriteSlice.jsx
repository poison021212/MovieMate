import { createSlice } from '@reduxjs/toolkit'

// 从 localStorage 读取初始收藏列表（如果有的话）
const loadFavorites = () => {
  try {
    const saved = localStorage.getItem('favorites');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const favoriteSlice = createSlice({
  name: 'favorite',
  initialState: {
    ids: loadFavorites(),// 存储收藏的电影ID数组
  },
  reducers: {
    addFavorite: (state, action) => {
      // action.payload 是电影ID
      if (!state.ids.includes(action.payload)) {
        state.ids.push(action.payload);
        localStorage.setItem('favorites', JSON.stringify(state.ids)); // 同步到 localStorage
      }
    },
    removeFavorite: (state, action) => {
      state.ids = state.ids.filter(id => id !== action.payload);
      localStorage.setItem('favorites', JSON.stringify(state.ids));
    },
  },
});

export const { addFavorite, removeFavorite } = favoriteSlice.actions;
export default favoriteSlice.reducer;
