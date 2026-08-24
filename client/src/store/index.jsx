import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import MovieApi from '@/store/API/MovieApi'
import { authSlice } from '@/store/Slice/authSlice'
import authApi from '@/store/API/authApi'
import reviewApi from '@/store/API/reviewApi'
import favoriteApi from '@/store/API/favoriteApi'
import vercelApi from '@/store/API/vercelApi'
import analyticsApi from '@/store/API/analyticsApi'
import adminApi from '@/store/API/adminApi'

const store = configureStore({
  reducer: {
    [MovieApi.reducerPath]: MovieApi.reducer,
    [authApi.reducerPath]: authApi.reducer,
    [reviewApi.reducerPath]: reviewApi.reducer,
    [favoriteApi.reducerPath]: favoriteApi.reducer,
    [vercelApi.reducerPath]: vercelApi.reducer,
    [analyticsApi.reducerPath]: analyticsApi.reducer,
    [adminApi.reducerPath]: adminApi.reducer,
    auth: authSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(MovieApi.middleware, authApi.middleware, reviewApi.middleware, favoriteApi.middleware, vercelApi.middleware, analyticsApi.middleware, adminApi.middleware),

})
setupListeners(store.dispatch)
export default store