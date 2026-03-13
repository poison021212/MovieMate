import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import MovieApi from '@/store/API/MovieApi'
import { favoriteSlice } from '@/store/Slice/favoriteSlice'
import { authSlice } from '@/store/Slice/authSlice'
import authApi from '@/store/API/authApi'
import { reviewSlice } from '@/store/Slice/reviewSlice'
import reviewApi from '@/store/API/reviewApi'
import favoriteApi from '@/store/API/favoriteApi'

const store = configureStore({
  reducer: {
    [MovieApi.reducerPath]: MovieApi.reducer,
    [authApi.reducerPath]: authApi.reducer,
    [reviewApi.reducerPath]: reviewApi.reducer,
    [favoriteApi.reducerPath]: favoriteApi.reducer,
    favorite: favoriteSlice.reducer,
    auth: authSlice.reducer,
    review: reviewSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(MovieApi.middleware, authApi.middleware, reviewApi.middleware, favoriteApi.middleware),

})
setupListeners(store.dispatch)
export default store